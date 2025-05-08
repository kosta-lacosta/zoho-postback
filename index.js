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
          refresh_token: 1000.eaa8b6abd9501f19a7318a3832e26d86.b7332829e917faf5db8dc1df3d24d60a,
          client_id: 1000.PMKVL76WC40TDI4LS9Q0MOCRGIPE0A,
          client_secret: 225bac66c839b4b48df2c5b63552bc6e37108f76bb,
          grant_type: refresh_token
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
      'https://www.zohoapis.eu/crm/v2/Leads',
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
