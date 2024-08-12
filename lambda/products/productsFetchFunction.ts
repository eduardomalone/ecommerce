import { Method } from "aws-cdk-lib/aws-apigateway";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import { ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB } from "aws-sdk"
import * as AWSXRay from "aws-xray-sdk"

AWSXRay.captureAWS(require("aws-sdk"))// habilita as informacoes de metricas

const productsDdb = process.env.PRODUCTS_DDB! //pegando a variavel de ambiente do dynamo
const ddbClient = new DynamoDB.DocumentClient()

const productRepository =  new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent,
    context: Context): Promise<APIGatewayProxyResult> {

        //identifica unicamente a execução do lambda
        const lambdaResquestId = context.awsRequestId

        //identificação da requisição que veio do APIGateway
        const apiRequestId = event.requestContext.requestId

        console.log(`### APIGATEWAY RequestId:  ${apiRequestId} - Lambda RequestId: ${lambdaResquestId} ###`)

        const method = event.httpMethod
        if(event.resource === "/products"){
            if(method === 'GET'){
                console.log('### metodo GET ###')
                const products = await productRepository.getAllProducts()    
                return{
                    statusCode: 200,
                    body: JSON.stringify({
                        products
                    })
                }
            }
        }else if(event.resource === "/products/{id}"){
            //pegando o parametro da url
            const productId = event.pathParameters!.id as string
            console.log(`### metodo GET /products/{id} - ${productId} ###`)
            try{
                const product = await productRepository.getProductById(productId)
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        product
                    })
                }
            }catch(error){
                console.error((<Error>error).message)
                return {
                    statusCode: 404,
                    body:(<Error>error).message
                }
            }
        }

        return{
            statusCode: 400,
            body: JSON.stringify({
                message: "### Bad request ###"
            })
        }

    }