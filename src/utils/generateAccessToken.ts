import axios from 'axios';
import qs from 'qs';
import { v4 as uuid } from 'uuid';
import { decrypt } from '../service/encryptionAndDecryption.service';
const generateAccessToken = async (
  client_id: string,
  client_secret: string
) => {
  const uniqueId = uuid();
  const id = decrypt(client_id);
  const secret = decrypt(client_secret);
  const data = qs.stringify({
    grant_type: 'client_credentials',
    code: '65CA5DA313A549D49D15D3119D9AD85D',
  });

  const authRes = await axios({
    method: 'POST',
    url: 'https://marketplace.walmartapis.com/v3/token',
    auth: {
      username: id,
      password: secret,
    },
    headers: {
      'WM_QOS.CORRELATION_ID': uniqueId,
      'WM_SVC.NAME': 'Walmart Marketplace',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    data,
  });
  const token = authRes.data.access_token;
  return token;
};
export default generateAccessToken;
