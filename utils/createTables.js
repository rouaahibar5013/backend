import { createUserTable } from "../models/userTable.js";
import { createProductsTable } from "../models/productTable.js";
import { createProductReviewsTable } from "../models/productReviewsTable.js";

import { createOrdersTable } from "../models/ordersTable.js";

import {createOrderItemsTable } from "../models/orderItemsTable.js"
import { createPaymentsTable } from "../models/paymentsTable.js"
import { createShippingInfoTable } from "../models/shippinginfoTable.js"




export const createTables = async () => {


    try {
        await createUserTable();
                 await createProductsTable();
await createProductReviewsTable();

         await createOrdersTable();
        await createOrderItemsTable();
      await createShippingInfoTable();
await createPaymentsTable();


console.log("all created successfully");

  } catch (error) {
        console.error("erreur creating tables",error);
    }
};