import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

async function getAccessToken() {
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
}

app.get('/api/alanbase', async (req, res) => {
  const { type, const1, const2, amount, Currency } = req.query;

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    // REGISTRATION
    if (type === 'registration') {
      const leadsResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?email=${const2}`,
        { headers }
      );
      const lead = leadsResp.data?.data?.[0];

      if (lead) {
        // Обновляем статус
        await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          { data: [{ id: lead.id, Lead_Status: 'Registered' }] },
          { headers }
        );
        return res.json({ success: true, message: 'Lead updated to Registered' });
      } else {
        // Создаём лида
        const response = await axios.post(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [
              {
                Last_Name: const1 || `Lead ${const2}`,
                Email: const2,
                Lead_Status: 'New'
              }
            ]
          },
          { headers }
        );
        return res.json({ success: true, created: response.data });
      }
    }

    // DEPOSIT
    if (type === 'deposit') {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?email=${const2}`,
        { headers }
      );
      const contact = contactResp.data?.data?.[0];

      if (contact) {
        const dealResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contact.id})`,
          { headers }
        );
        const deal = dealResp.data?.data?.[0];

        if (!deal) throw new Error('Сделка для контакта не найдена');

        const depositResp = await axios.post(
          `https://www.zohoapis.eu/crm/v2/deposits`,
          {
            data: [
              {
                Name: `Оплата на сумму ${amount}`,
                amount,
                Currency,
                contact: contact.id,
                Retention: deal.id,
                Email: const2
              }
            ]
          },
          { headers }
        );
        return res.json({ success: true, deposit: depositResp.data });
      } else {
        const leadResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Leads/search?email=${const2}`,
          { headers }
        );
        const lead = leadResp.data?.data?.[0];

        if (!lead) throw new Error('Лид не найден');

        const depositResp = await axios.post(
          `https://www.zohoapis.eu/crm/v2/deposits`,
          {
            data: [
              {
                Name: `Оплата на сумму ${amount}`,
                amount,
                Currency,
                field1: lead.id,
                Email: const2
              }
            ]
          },
          { headers }
        );

        await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [{ id: lead.id, Lead_Status: 'FTD' }]
          },
          { headers }
        );

        return res.json({ success: true, deposit: depositResp.data, message: 'Создан deposit и обновлён лид' });
      }
    }

    // WITHDRAWAL
    if (type === 'withdrawal') {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?email=${const2}`,
        { headers }
      );
      const contact = contactResp.data?.data?.[0];
      if (!contact) throw new Error('Контакт с таким Email не найден');

      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contact.id})`,
        { headers }
      );
      const deal = dealResp.data?.data?.[0];
      if (!deal) throw new Error('Сделка не найдена');

      const withdrawalResp = await axios.post(
        `https://www.zohoapis.eu/crm/v2/withdrawals`,
        {
          data: [
            {
              Name: `Вывод на сумму ${amount}`,
              amount,
              Currency,
              contact: contact.id,
              Retention: deal.id,
              Email: const2
            }
          ]
        },
        { headers }
      );
      return res.json({ success: true, withdrawal: withdrawalResp.data });
    }

    return res.status(400).json({ success: false, message: 'Неизвестный тип события' });
  } catch (error) {
    console.error('Ошибка:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
