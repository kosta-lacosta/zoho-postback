import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Получение нового access_token по refresh_token
async function getAccessToken() {
  try {
    const response = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      null,
      {
        params: {
          refresh_token: process.env.REFRESH_TOKEN,
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'refresh_token' // <--- исправлено
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Ошибка при получении access token:', error.response?.data || error.message);
    throw new Error('Ошибка обновления токена');
  }
}

// Основной эндпоинт для приёма постбеков
app.get('/api/alanbase', async (req, res) => {
  const {
    click_id,
    status,
    amount,
    Currency,
    Source,
    type,
    Last_Name,
    Email
  } = req.query;

  try {
    const token = await getAccessToken();

    const response = await axios.post(
      'https://www.zohoapis.eu/crm/v2/Leads',
      {
        data: [
          {
            Last_Name: Last_Name || `Postback ${id}`,
            click_id_Alanbase: id,
            amount: amount,
            status: 'New',
            FDT: value,
            Currency: currency,
            Source: custom1,
            type: type,
            Email: Email
          }
        ]
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`
        }
      }
    );

    res.json({ success: true, zoho: response.data });
  } catch (error) {
    console.error('Ошибка создания лида:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
