import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

// Получение Zoho access_token
async function getAccessToken() {
  try {
    const params = new URLSearchParams();
    params.append('client_id', '1000.PMKVL76WC40TDI4LS9Q0MOCRGIPE0A');
    params.append('client_secret', '225bac66c839b4b48df2c5b63552bc6e37108f76bb');
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', '1000.533a83031fea26bb4d0470e51f023930.ff8ded7294143ff9f17ff71c9c740dae');

    const response = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return response.data.access_token;
  } catch (error) {
    throw new Error('Ошибка получения токена: ' + (error?.response?.data?.error || error.message));
  }
}

// Обработчик Alanbase постбэков
app.get('/api/alanbase', async (req, res) => {
  const {
    id,
    status,
    value,
    amount,
    goal,
    currency,
    custom1,
    const2,
    sub_id1,
    type: rawType
  } = req.query;

  const clickId = id || custom1 || sub_id1;
  const typeMap = {
    reg: 'registration',
    dep: 'deposit',
    red: 'redeposit',
    wd: 'withdrawal'
  };

  const type = typeMap[rawType || goal] || 'unknown';

  if (!clickId) {
    return res.status(400).json({ success: false, error: 'Параметр click_id (id/custom1/sub_id1) не передан' });
  }

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    // 🔵 Регистрация
    if (type === 'registration') {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(Email:equals:${const2})`,
        { headers }
      );
      const lead = leadResp.data?.data?.[0];

      if (lead) {
        const updateResp = await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [{ id: lead.id, Lead_Status: 'Registered' }]
          },
          { headers }
        );
        return res.json({ success: true, updated: updateResp.data });
      } else {
        const createResp = await axios.post(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [{
              Last_Name: const2 || `Reg ${clickId}`,
              click_id_Alanbase: clickId,
              amount: amount || value || 0,
              Lead_Status: 'Registered',
              Currency: currency,
              type: 'registration',
              Email: const2
            }]
          },
          { headers }
        );
        return res.json({ success: true, created: createResp.data });
      }
    }

    // 🟢 Депозит
    if (type === 'deposit') {
      let contactId = null;
      let leadId = null;
      let retentionId = null;

      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(click_id_Alanbase:equals:${clickId})`,
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
          `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(click_id_Alanbase:equals:${clickId})`,
          { headers }
        );
        const lead = leadResp.data?.data?.[0];
        if (!lead) throw new Error('Лид не найден');
        leadId = lead.id;

        const dealResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(click_id_Alanbase:equals:${clickId})`,
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
        'https://www.zohoapis.eu/crm/v2/deposits',
        {
          data: [{
            Name: `Оплата на сумму ${amount || value}`,
            amount: amount || value,
            contact: contactId,
            field1: leadId,
            Retention: retentionId,
            Currency: currency,
            Email: const2
          }]
        },
        { headers }
      );

      return res.json({ success: true, deposit: depositResp.data });
    }

    // 🔁 Повторный депозит / Вывод
    if (type === 'redeposit' || type === 'withdrawal') {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      const contact = contactResp.data?.data?.[0];
      if (!contact) throw new Error('Контакт не найден');

      const dealsResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contact.id})`,
        { headers }
      );
      const deal = dealsResp.data?.data?.[0];
      if (!deal) throw new Error('Retention-сделка не найдена');

      const module = type === 'redeposit' ? 'deposits' : 'withdrawals';
      const name = `${type === 'redeposit' ? 'Повторный депозит' : 'Вывод'} на сумму ${amount || value}`;

      const recordResp = await axios.post(
        `https://www.zohoapis.eu/crm/v2/${module}`,
        {
          data: [{
            Name: name,
            amount: amount || value,
            contact: contact.id,
            Retention: deal.id,
            Currency: currency,
            Email: const2
          }]
        },
        { headers }
      );

      return res.json({ success: true, [module]: recordResp.data });
    }

    // ❌ Неизвестный тип
    res.status(400).json({ success: false, error: 'Неизвестный тип события' });
  } catch (error) {
    console.error('Ошибка обработки запроса:', error?.response?.data || error.message);
    res.status(500).json({ success: false, error: error?.response?.data || error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
