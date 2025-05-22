export const generateAuthorizationToken = (client_id, client_secret) => {
  const credentials = `${client_id}:${client_secret}`;
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
};

console.log(
  generateAuthorizationToken(
    'ef19c693-6b6e-4244-a5fc-f2f92a2fb7bd',
    'JktfEJrDioZsyWFTwh94IvYaKvi0ma8ukqWZ_sREReE5CT1HLEzF9dA3f4XYDbDM4LxFDsOJ92ZPzBtrjFkBRA'
  )
);

/*

    {
      "sellerOrderId": "200013337893408",
      "originSystemOrderId": "0",
      "orderType": "DOMESTIC",
      "status": "ACKNOWLEDGED",
      "orderDate": "2025-05-22T02:02:42.644Z",
      "buyerInfo": {
        "primaryContact": {
          "name": {
            "firstName": "Raymundo",
            "lastName": "Almeida"
          }
        }
      },
      "orderLines": [
        {
          "fulfillmentType": "DELIVERY",
          "shippingMethod": "EXPEDITED",
          "lineId": "1",
          "orderLineQuantityInfo": [
            {
              "status": "PROCESSING",
              "statusDescription": "PO Acknowledged",
              "statusQuantity": {
                "unitOfMeasure": "EA",
                "measurementValue": 1
              }
            }
          ],
          "orderProduct": {
            "productName": "GoPro HERO11 Black Battery Charger with 2 Enduro Batteries",
            "sku": "5310108219"
          },
          "orderedQty": {
            "unitOfMeasure": "EA",
            "measurementValue": 1
          },
          "shipToAddress": {
            "address": {
              "addressLineOne": "23 Davis Rd",
              "addressLineTwo": "Apt A8",
              "addressType": "RESIDENTIAL",
              "city": "Acton",
              "countryCode": "USA",
              "postalCode": "01720",
              "stateOrProvinceName": "MA",
              "stateOrProvinceCode": "MA"
            },
            "name": {
              "firstName": "Raymundo",
              "lastName": "Almeida",
              "completeName": "Raymundo Almeida"
            }
          }
        }
      ]
    },

*/
