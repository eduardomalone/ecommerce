import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodeJs from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as iam from "aws-cdk-lib/aws-iam"
import * as sqs from "aws-cdk-lib/aws-sqs"

import { Construct } from "constructs"

interface ProductsAppStackProps extends cdk.StackProps {
    eventsDdb: dynamodb.Table
 }


export class ProductsAppStack extends cdk.Stack {
    //chamando a função lambda de consulta
    readonly productsFetchHandler: lambdaNodeJs.NodejsFunction
    //chamando a funcao de ADM de produtos
    readonly productsAdminHandler: lambdaNodeJs.NodejsFunction
    // a principio n precisava
    readonly productDdb: dynamodb.Table

    constructor(scope: Construct, id: string, props: ProductsAppStackProps){
        super(scope, id, props)

        // construcao do dynamoDB
        this.productDdb = new dynamodb.Table(this, "ProductsDdb", {
            tableName: "products",
            removalPolicy: cdk.RemovalPolicy.DESTROY, //permissionamento p exclusao do BD qdo destruir a stack
            // atributos da tabela
            partitionKey: {
                name: "id",
                type: dynamodb.AttributeType.STRING
            },
            //parametros relacionados a capacidade de recurso $$$$
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        })

        //criacao dos Layers Produtos
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

        //Product Events Layer
        const productEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductEventsLayerVersionArn")
        const productEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductEventsLayerVersionArn", productEventsLayerArn)

        //Auth user info layer
        const authUserInfoLayerArn = ssm.StringParameter.valueForStringParameter(this, 
           "AuthUserInfoLayerVersionArn")
        const authUserInfoLayer = lambda.LayerVersion.fromLayerVersionArn(this, "AuthUserInfoLayerVersionArn",
           authUserInfoLayerArn)

      const dlq = new sqs.Queue(this, "ProductEventsDlq", {
         queueName: "product-events-dlq",
         retentionPeriod: cdk.Duration.days(10)
      })
      const productEventsHandler = new lambdaNodeJs.NodejsFunction(this, 
         "ProductsEventsFunction", {
            functionName: "ProductsEventsFunction",
            entry: "lambda/products/productEventsFunction.ts",
            handler: "handler",
            runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
               minify: true,
               sourceMap: false               
            },            
            environment: {
               EVENTS_DDB: props.eventsDdb.tableName
            }, 
            layers: [productEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            deadLetterQueueEnabled: true,
            deadLetterQueue: dlq,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
      })
      
      //props.eventsDdb.grantWriteData(productEventsHandler)
      const eventsDdbPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:PutItem"],
        resources: [props.eventsDdb.tableArn],
        conditions: {
           ['ForAllValues:StringLike']: {
              'dynamodb:LeadingKeys': ['#product_*']
           }
        }
     })
     productEventsHandler.addToRolePolicy(eventsDdbPolicy)


        //construção da função
        this.productsFetchHandler = new lambdaNodeJs.NodejsFunction(this, "ProductsFetchFunction", {
            runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "ProductsFetchFunction", 
            entry: "lambda/products/productsFetchFunction.ts",//invocação de um metodo qdo a lambda é chamada 
            handler: "handler",//metodo a ser invocado
            timeout: cdk.Duration.seconds(5),
            bundling:{
                minify: true, //pega o codigo e deixa o mais enxuto/menor
                sourceMap: false//desliga a geração de mapas p debug
            },
            environment: {
                //informando ao lambda (sdk) qual tabela acessar
                PRODUCTS_DDB: this.productDdb.tableName
            },
            layers: [productsLayer],//instruindo a funcao p buscar codigo
            tracing: lambda.Tracing.ACTIVE, // ativa as inforcacoes de rastreio
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
            
        })
        //dando o permissionamento de leitura desse lambda na tabela
        this.productDdb.grantReadData(this.productsFetchHandler)

        this.productsAdminHandler = new lambdaNodeJs.NodejsFunction(this, "ProductsAdminFunction", {
            runtime: lambda.Runtime.NODEJS_20_X,
            memorySize: 512,
            functionName: "ProductsAdminFunction", 
            entry: "lambda/products/productsAdminFunction.ts",//invocação de um metodo qdo a lambda é chamada 
            handler: "handler",//metodo a ser invocado
            timeout: cdk.Duration.seconds(5),
            bundling:{
                minify: true, //pega o codigo e deixa o mais enxuto/menor
                sourceMap: false//desliga a geração de mapas p debug
            },
            environment: {
                //informando ao lambda (sdk) qual tabela acessar
               PRODUCTS_DDB: this.productDdb.tableName,
               PRODUCT_EVENTS_FUNCTION_NAME: productEventsHandler.functionName
            },
            layers: [productsLayer, productEventsLayer, authUserInfoLayer],//instruindo a funcao p buscar codigo
            tracing: lambda.Tracing.ACTIVE, // ativa as inforcacoes de rastreio
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        })
        //dando o permissionamento de leitura desse lambda na tabela
        this.productDdb.grantWriteData(this.productsAdminHandler)
        productEventsHandler.grantInvoke(this.productsAdminHandler)
    }
}
