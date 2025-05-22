export const generateAuthorizationToken = (
  client_id: string,
  client_secret: string
) => {
  const credentials = `${client_id}:${client_secret}`;
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
};
