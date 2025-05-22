import mongoose from 'mongoose';

const FulfillmentSchema = new mongoose.Schema(
  {
    sellerOrderId: {
      type: String,
      required: true,
    },
    originSystemOrderId: {
      type: String,
    },
    orderType: {
      type: String,
      enum: ['DOMESTIC', 'INTERNATIONAL'],
      default: 'DOMESTIC',
    },
    status: {
      type: String,
    },
    orderDate: {
      type: Date,
    },

    buyerInfo: {
      primaryContact: {
        name: {
          firstName: {
            type: String,
          },
          lastName: {
            type: String,
          },
        },
      },
    },

    orderLines: [
      {
        fulfillmentType: {
          type: String,
          enum: ['DELIVERY', 'PICKUP'],
        },
        shippingMethod: {
          type: String,
        },
        lineId: {
          type: String,
        },

        orderLineQuantityInfo: [
          {
            status: {
              type: String,
            },
            statusDescription: {
              type: String,
            },
            statusQuantity: {
              unitOfMeasure: {
                type: String,
              },
              measurementValue: {
                type: Number,
              },
            },
          },
        ],

        orderProduct: {
          productName: {
            type: String,
          },
          sku: {
            type: String,
          },
        },

        orderedQty: {
          unitOfMeasure: {
            type: String,
          },
          measurementValue: {
            type: Number,
          },
        },

        shipToAddress: {
          address: {
            addressLineOne: {
              type: String,
            },
            addressLineTwo: {
              type: String,
            },
            addressType: {
              type: String,
              enum: ['RESIDENTIAL', 'COMMERCIAL'],
            },
            city: {
              type: String,
            },
            countryCode: {
              type: String,
            },
            postalCode: {
              type: String,
            },
            stateOrProvinceName: {
              type: String,
            },
            stateOrProvinceCode: {
              type: String,
            },
          },
          name: {
            firstName: {
              type: String,
            },
            lastName: {
              type: String,
            },
            completeName: {
              type: String,
            },
          },
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Fulfillment', FulfillmentSchema);
