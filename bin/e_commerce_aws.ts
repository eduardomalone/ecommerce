#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecommerceAPI-stack';
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack';
 import { EventsDdbStack } from '../lib/eventsDdb-stack';
 import { OrdersAppLayersStack } from '../lib/ordersAppLayers-stack';
 import { OrdersAppStack } from '../lib/ordersApp-stack';
 import { InvoiceWSApiStack } from "../lib/invoiceWSApi-stack"
 import { InvoicesAppLayersStack } from "../lib/invoicesAppLayers-stack"
 import { AuditEventBusStack } from '../lib/auditEventBus-stack';
 import { AuthLayersStack } from '../lib/authLayers-stack';

// classe responsavel por iniciar a criação das stacks durante o deploy

const app = new cdk.App();

const env: cdk.Environment = {
  account: "839766706131",
  region: "us-east-1"
}
// tags para identificar custos
const tags = {
  cost: "ECommerce",
  team: "4Doctors"
}


const auditEventBus = new AuditEventBusStack(app, "AuditEvents", {
  tags: {
    cost: 'Audit',
    team: '4Doctors'
  },
  env: env
})

const authLayersStack = new AuthLayersStack(app, "AuthLayers", {
  tags: tags,
  env: env
})

const productsAppLayersStack = new ProductsAppLayersStack(app, "ProductsAppLayers", {
  tags: tags,
  env: env
})

const eventsDdbStack = new EventsDdbStack(app, "EventsDdb", {
  tags: tags,
  env: env
})

//defindo a stack a ser criada
const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  eventsDdb: eventsDdbStack.table,
  tags: tags,
  env: env
})

productsAppStack.addDependency(productsAppLayersStack)
productsAppStack.addDependency(authLayersStack)
productsAppStack.addDependency(eventsDdbStack)


const ordersAppLayersStack = new OrdersAppLayersStack(app, "OrdersAppLayers", {
  tags: tags,
  env: env
})

const ordersAppStack = new OrdersAppStack(app, "OrdersApp", {
  tags: tags,
  env: env,
  productsDdb: productsAppStack.productDdb,
  eventsDdb: eventsDdbStack.table,
  auditBus: auditEventBus.bus
})
ordersAppStack.addDependency(productsAppStack)
ordersAppStack.addDependency(ordersAppLayersStack)
ordersAppStack.addDependency(eventsDdbStack)
ordersAppStack.addDependency(auditEventBus)


//defindo a stack a ser criada
//passagem de parametros entre stacks
//associando a função handler a criação da stack
const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApi", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  ordersHandler: ordersAppStack.ordersHandler,
  orderEventsFetchHandler: ordersAppStack.orderEventsFetchHandler,
  tags: tags,
  env: env
})
//evidenciado a dependencia entre stacks
eCommerceApiStack.addDependency(productsAppStack)
eCommerceApiStack.addDependency(ordersAppStack)

const invoicesAppLayersStack = new InvoicesAppLayersStack(app, "InvoicesAppLayer", {
  tags: {
    cost: "InvoiceApp",
    team: "4Doctors"
  },
  env: env
})

const invoiceWSApiStack = new InvoiceWSApiStack(app, "InvoiceApi", {
  eventsDdb: eventsDdbStack.table,
  auditBus: auditEventBus.bus,
  tags: {
    cost: "InvoiceApp",
    team: "4Doctors"
  },
  env: env
})

invoiceWSApiStack.addDependency(invoicesAppLayersStack)
invoiceWSApiStack.addDependency(eventsDdbStack)
invoiceWSApiStack.addDependency(auditEventBus)