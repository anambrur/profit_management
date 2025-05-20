import axios from 'axios';
import { v4 as uuid } from 'uuid';
const getAllProducts = async (token: string) => {
  try {
    const uniqueId = uuid();
    const res = await axios({
      method: 'GET',
      url: 'https://marketplace.walmartapis.com/v3/items?limit=5000',
      headers: {
        'WM_SEC.ACCESS_TOKEN': token,
        'WM_CONSUMER.CHANNEL.TYPE': 'PARTNER',
        'WM_QOS.CORRELATION_ID': uniqueId,
        'WM_SVC.NAME': 'Walmart Marketplace',
      },
    });
    return res.data.ItemResponse;
  } catch (error) {
    console.log('Product Not Found Axios Error');
  }
};

export default getAllProducts;
