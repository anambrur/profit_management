import axios from 'axios';
import qs from 'qs';
import { v4 as uuid } from 'uuid';
// import { decrypt } from '../service/encryptionAndDecryption.service';

const generateAccessToken = async (
  client_id: string,
  client_secret: string
): Promise<string> => {
  try {
    // 1. Validate inputs more thoroughly
    if (typeof client_id !== 'string' || typeof client_secret !== 'string') {
      throw new Error('Client credentials must be strings');
    }

    if (!client_id.trim() || !client_secret.trim()) {
      throw new Error('Client credentials cannot be empty');
    }

    const uniqueId = uuid();

    // 2. Add decryption validation

    const id = client_id;
    const secret = client_secret;

    // try {
    //   id = decrypt(client_id);
    //   secret = decrypt(client_secret);

    // } catch (decryptError) {
    //   throw new Error(
    //     `Decryption failed: ${decryptError instanceof Error ? decryptError.message : 'Unknown error'}`
    //   );
    // }

    // // 3. Validate decrypted values
    // if (!id || !secret) {
    //   throw new Error('Decrypted credentials are empty');
    // }

    const data = qs.stringify({
      grant_type: 'client_credentials',
      code: '65CA5DA313A549D49D15D3119D9AD85D',
    });

    // 4. Make the API request
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

    if (!authRes.data?.access_token) {
      throw new Error('No access token received from Walmart API');
    }

    return authRes.data.access_token;
  } catch (error) {
    console.error(
      'Error generating access token:',
      error instanceof Error ? error.message : error
    );
    throw error; // Re-throw to be handled by the caller
  }
};

export default generateAccessToken;
