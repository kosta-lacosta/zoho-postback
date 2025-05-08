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
          client_id: '1000.PMKVL76WC40TDI4LS9Q0MOCRGIPE0A',
          client_secret: '225bac66c839b4b48df2c5b63552bc6e37108f76bb',
          refresh_token: '1000.eaa8b6abd9501f19a7318a3832e26d86.b7332829e917faf5db8dc1df3d24d60a',
          grant_type: 'refresh_token'
        }
      }
    );
    return response.data.access_token;
    console.log('Access Token:', response.data.access_token);

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
            Last_Name: Last_Name || `Postback ${click_id}`,
            click_id_Alanbase: click_id,
            amount: amount,
            status: 'New',
            FDT: amount,
            Currency: Currency,
            Source: Source,
            type: type,
            Email: Email
          }
        ]
      },
      {
        headers: {
          Authorization: 'Zoho-oauthtoken ' + token
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







import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

async function getAccessToken() {
  try {
    const response = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      null,
      {
        params: {
          client_id: '1000.PMKVL76WC40TDI4LS9Q0MOCRGIPE0A',
          client_secret: '225bac66c839b4b48df2c5b63552bc6e37108f76bb',
          refresh_token: '1000.eaa8b6abd9501f19a7318a3832e26d86.b7332829e917faf5db8dc1df3d24d60a',
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

// Основной эндпоинт
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
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    if (type === 'registration') {
      const response = await axios.post(
        'https://www.zohoapis.eu/crm/v2/Leads',
        {
          data: [
            {
              Last_Name: Last_Name || `Postback ${click_id}`,
              click_id_Alanbase: click_id,
              amount: amount,
              status: 'New',
              Currency,
              Source,
              type,
              Email
            }
          ]
        },
        { headers }
      );
      return res.json({ success: true, zoho: response.data });
    }

    if (type === 'FDT') {
      const findLead = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?email=${Email}`,
        { headers }
      );

      const leadId = findLead.data?.data?.[0]?.id;
      if (!leadId) throw new Error('Лид с таким Email не найден');

      const updateLead = await axios.put(
        'https://www.zohoapis.eu/crm/v2/Leads',
        {
          data: [{ id: leadId, status: 'FDT' }]
        },
        { headers }
      );
      return res.json({ success: true, updated: updateLead.data });
    }

    if (type === 'redeposit' || type === 'withdrawal') {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?email=${Email}`,
        { headers }
      );
      const contact = contactResp.data?.data?.[0];
      if (!contact) throw new Error('Контакт с таким Email не найден');

      const dealsResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contact.id})`,
        { headers }
      );

      const deal = dealsResp.data?.data?.find(d => d.Deal_Type === 'Retention');
      if (!deal) throw new Error('Retention-сделка не найдена');

      const module = type === 'redeposit' ? 'deposits' : 'withdrawals';
      const name = `Оплата на сумму ${amount}`;

      const createPayment = await axios.post(
        `https://www.zohoapis.eu/crm/v2/${module}`,
        {
          data: [
            {
              Name: name,
              amount,
              Contact: contact.id,
              Retention: deal.id
            }
          ]
        },
        { headers }
      );

      return res.json({ success: true, payment: createPayment.data });
    }

    res.status(400).json({ success: false, error: 'Неизвестный тип события' });
  } catch (error) {
    console.error('Ошибка обработки запроса:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
