import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

// ✅ Фикс: Получение access_token с правильным Content-Type
async function getAccessToken() {
  try {
    const params = new URLSearchParams();
    params.append('client_id', '1000.PMKVL76WC40TDI4LS9Q0MOCRGIPE0A');
    params.append('client_secret', '225bac66c839b4b48df2c5b63552bc6e37108f76bb');
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', '1000.eaa8b6abd9501f19a7318a3832e26d86.b7332829e917faf5db8dc1df3d24d60a');

    const response = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    throw new Error('Ошибка получения токена: ' + (error?.response?.data?.error || error.message));
  }
}

// Главный обработчик запроса API для Alanbase
app.get('/api/alanbase', async (req, res) => {
  const {
    click_id,
    status,
    amount,
    Currency,
    Source,
    Last_Name,
    Email,
    value,
    id,
    custom1,
    goal,
    const2,
    type: rawType
  } = req.query;

  let type = rawType || goal;
  if (type === 'reg') type = 'registration';
  if (type === 'dep') type = 'deposit';
  if (type === 'red') type = 'redeposit';
  if (type === 'wd')  type = 'withdrawal';

  const const1 = Last_Name || `Postback ${custom1 || click_id}`;
 // const const2 = Email;

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    // ---------- Регистрация ----------
    if (type === 'registration') {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?click_id_Alanbase=${id}`,
        { headers }
      );
      const lead = leadResp.data?.data?.[0];

      if (lead) {
        const updateResp = await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [
              {
                id: lead.id,
                Lead_Status: 'Registered'
              }
            ]
          },
          { headers }
        );
        return res.json({ success: true, updated: updateResp.data });
      } else {
        const createResp = await axios.post(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [
              {
                Last_Name: const1,
                click_id_Alanbase: custom1 || click_id,
                amount: amount || value || 0,
                Lead_Status: 'Registered',
                Currency,
                Lead_Source: Source,
                type: 'registration',
                Email: const2
              }
            ]
          },
          { headers }
        );
        return res.json({ success: true, created: createResp.data });
      }
    }

    // ---------- Депозит / FTD ----------
    if (type === 'deposit') {
      let contactId = null;
      let retentionId = null;

      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(click_id_Alanbase:equals:${id})`,
        { headers }
      );
      const contact = contactResp.data?.data?.[0];

      if (contact) {
        contactId = contact.id;
        const dealResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contactId})`,
          { headers }
        );
        const deal = dealResp.data?.data?.[0];
        if (!deal) throw new Error('Сделка не найдена для контакта');
        retentionId = deal.id;
      } else {
        const leadResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(click_id_Alanbase:equals:${id})`,
          { headers }
        );
        const lead = leadResp.data?.data?.[0];
        if (!lead) throw new Error('Лид не найден');

        const dealResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Lead_Name:equals:${lead.id})`,
          { headers }
        );
        const deal = dealResp.data?.data?.[0];
        if (!deal) throw new Error('Сделка не найдена для лида');

        retentionId = deal.id;

        await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [{ id: lead.id, Lead_Status: 'FTD' }]
          },
          { headers }
        );
      }

      const depositResp = await axios.post(
        `https://www.zohoapis.eu/crm/v2/deposits`,
        {
          data: [
            {
              Name: `Оплата на сумму ${amount || value}`,
              amount: amount || value,
              contact: contactId,
              field1: contactId ? undefined : lead.id,
              Retention: retentionId,
              Currency,
              Email: const2
            }
          ]
        },
        { headers }
      );

      return res.json({ success: true, deposit: depositResp.data });
    }

    // ---------- Повторный депозит / Вывод ----------
    if (type === 'redeposit' || type === 'withdrawal') {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?click_id_Alanbase=${id}`,
        { headers }
      );
      const contact = contactResp.data?.data?.[0];
      if (!contact) throw new Error('Контакт с таким Email не найден');

      const dealsResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contact.id})`,
        { headers }
      );
      const deal = dealsResp.data?.data?.[0];
      if (!deal) throw new Error('Retention-сделка не найдена');

      const module = type === 'redeposit' ? 'deposits' : 'withdrawals';
      const name = type === 'redeposit'
        ? `Повторный депозит на сумму ${amount || value}`
        : `Вывод на сумму ${amount || value}`;

      const recordResp = await axios.post(
        `https://www.zohoapis.eu/crm/v2/${module}`,
        {
          data: [
            {
              Name: name,
              amount: amount || value,
              contact: contact.id,
              Retention: deal.id,
              Currency,
              Email: const2
            }
          ]
        },
        { headers }
      );

      return res.json({ success: true, [module]: recordResp.data });
    }

    res.status(400).json({ success: false, error: 'Неизвестный тип события' });
  } catch (error) {
    console.error('Ошибка обработки запроса:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
