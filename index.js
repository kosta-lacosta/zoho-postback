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
          grant_type: 'refresh_token'
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
  const { id, status, value, goal, currency, custom1, type, name, email } = req.query;

  try {
    const token = await getAccessToken();

    const response = await axios.post(
      'https://www.zohoapis.com/crm/v2/Leads',
      {
        data: [
          {
            Last_Name: 'name',
            click_id: '1312344323543',
            status: 'status',
            FDT: '20',
            Currency: 'USD',
            Source: 'google',
            type: 'registration',
            Email: 'ematest@test.com'
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
    console.error('Ошибка создания сделки:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
