import { Method } from "aws-cdk-lib/aws-apigateway";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { CognitoIdentityServiceProvider, DynamoDB, Lambda } from "aws-sdk"
import * as AWSXRay from "aws-xray-sdk"
import { AuthInfoService } from "/opt/nodejs/authUserInfo";
import { ProductEvent, ProductEventType } from "/opt/nodejs/productEventsLayer";

AWSXRay.captureAWS(require("aws-sdk"))// habilita as informacoes de metricas
const productsDdb = process.env.PRODUCTS_DDB! //pegando a variavel de ambiente do dynamo

const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!
const ddbClient = new DynamoDB.DocumentClient()

const productRepository =  new ProductRepository(ddbClient, productsDdb)
const lambdaClient = new Lambda()
const cognitoIdentityServiceProvider = new CognitoIdentityServiceProvider()

const authInfoService = new AuthInfoService(cognitoIdentityServiceProvider)

export async function handler(event: APIGatewayProxyEvent,
    context: Context): Promise<APIGatewayProxyResult> {

        //identifica unicamente a execução do lambda
        const lambdaResquestId = context.awsRequestId

        //identificação da requisição que veio do APIGateway
        const apiRequestId = event.requestContext.requestId
        
        const userEmail = await authInfoService.getUserInfo(event.requestContext.authorizer)

        console.log(`### APIGATEWAY RequestId:  ${apiRequestId} - Lambda RequestId: ${lambdaResquestId} ###`)

        if(event.resource === "/products"){
            console.log(" ### POST /products ###")
            const product = JSON.parse(event.body!) as Product //capturando o body
            const productCreated = await productRepository.create(product)
            return {
                statusCode: 201,
                body: JSON.stringify(productCreated)
            }
        }else if(event.resource === "/products/{id}"){
            const productId = event.pathParameters!.id as string
            if(event.httpMethod === "PUT"){
                console.log(` ### PUT /products/${productId} ###`)
                const product = JSON.parse(event.body!) as Product //capturando o body
                try {
                    const productUpdated = await productRepository.updateProduct(productId, product)
                    return {
                        statusCode: 200,
                        body: JSON.stringify(productUpdated)
                    }
                } catch (ConditionalCheckFailedException) {
                    return {
                        statusCode: 404,
                        body: "Produto nao encontrado"
                    }
                }
            }else if(event.httpMethod === "DELETE"){
                console.log(` ### DELETE /products/${productId} ###`)
                try {
                    const product = await productRepository.deleteProduct(productId)
                    const response = await sendProductEvent(product, 
                        ProductEventType.DELETED,
                        userEmail, lambdaResquestId)
                     console.log(response)
                    return {
                        statusCode: 200,
                        body: JSON.stringify(product)
                    }
                } catch (error) {
                    console.error((<Error>error).message)
                    return{
                        statusCode: 404,
                        body: (<Error>error).message
                    }
                }
            }
        }
            
        return {
            statusCode: 400,
            body: "Bad Request"
        }
    }

    function sendProductEvent(product: Product, 
        eventType: ProductEventType, email: string, 
        lambdaRequestId: string) {
     
        const event: ProductEvent = {
           email: email,
           eventType: eventType,
           productCode: product.code,
           productId: product.id,
           productPrice: product.price,
           requestId: lambdaRequestId
        }
     
        return lambdaClient.invoke({
           FunctionName: productEventsFunctionName,
           Payload: JSON.stringify(event),
           InvocationType: "Event"
        }).promise()
     }