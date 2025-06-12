import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

async function getAccessToken() {
  try {
    const params = new URLSearchParams();
    params.append('client_id', process.env.ZOHO_CLIENT_ID);
    params.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', process.env.ZOHO_REFRESH_TOKEN);

    const response = await axios.post(
      'https://accounts.zoho.eu/oauth/v2/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return response.data.access_token;
  } catch (error) {
    throw new Error('Ошибка получения токена: ' + (error?.response?.data?.error || error.message));
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length >= 5;
}

function generateContactName(lead, clickId) {
  if (lead.Last_Name && lead.Last_Name.trim() && lead.Last_Name !== lead.Email) {
    return lead.Last_Name.trim();
  }
  if (lead.First_Name && lead.First_Name.trim()) {
    return lead.First_Name.trim();
  }
  if (lead.Email && isValidEmail(lead.Email)) {
    const emailPart = lead.Email.split('@')[0];
    if (emailPart && emailPart.length > 0) {
      return emailPart;
    }
  }
  if (clickId && clickId.toString().trim()) {
    return `Contact_${clickId}`;
  }
  return 'Unknown Contact';
}

async function findLead(clickId, email, headers) {
  try {
    if (clickId) {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (leadResp.data?.data?.[0]) {
        return leadResp.data.data[0];
      }
    }
    if (email) {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(Email:equals:${email})`,
        { headers }
      );
      if (leadResp.data?.data?.[0]) {
        return leadResp.data.data[0];
      }
    }
    return null;
  } catch (error) {
    console.error('Ошибка поиска лида:', error?.response?.data || error.message);
    return null;
  }
}

async function findContact(clickId, email, headers) {
  try {
    if (clickId) {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (contactResp.data?.data?.[0]) {
        return contactResp.data.data[0];
      }
    }
    if (email) {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(Email:equals:${email})`,
        { headers }
      );
      if (contactResp.data?.data?.[0]) {
        return contactResp.data.data[0];
      }
    }
    return null;
  } catch (error) {
    console.error('Ошибка поиска контакта:', error?.response?.data || error.message);
    return null;
  }
}

async function findDeal(contactId, clickId, email, headers) {
  try {
    if (contactId) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contactId})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) {
        return dealResp.data.data[0];
      }
    }
    if (clickId) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) {
        return dealResp.data.data[0];
      }
    }
    if (email) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Email:equals:${email})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) {
        return dealResp.data.data[0];
      }
    }
    return null;
  } catch (error) {
    console.error('Ошибка поиска сделки:', error?.response?.data || error.message);
    return null;
  }
}

app.get('/api/alanbase', async (req, res) => {
  const {
    id, status, value, amount, goal, currency,
    custom1, const2, sub_id1, type: rawType
  } = req.query;

  const clickId = id || custom1 || sub_id1;
  const email = const2;
  const typeMap = {
    reg: 'registration',
    dep: 'deposit',
    red: 'redeposit',
    wd: 'withdrawal'
  };
  const type = typeMap[rawType || goal] || 'unknown';

  if (!clickId && !email) {
    return res.status(400).json({ success: false, error: 'Требуется click_id или email' });
  }

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    // 🔵 Регистрация
    if (type === 'registration') {
      const lead = await findLead(clickId, email, headers);
      if (lead) {
        const updateResp = await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          { data: [{ id: lead.id, Lead_Status: 'Registered' }] },
          { headers }
        );
        return res.json({ success: true, updated: updateResp.data });
      } else {
        const createResp = await axios.post(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [{
              Last_Name: email || `Reg ${clickId}`,
              click_id_Alanbase: clickId,
              amount: amount || value || 0,
              Lead_Status: 'Registered',
              Currency: currency,
              type: 'registration',
              Email: email
            }]
          },
          { headers }
        );
        return res.json({ success: true, created: createResp.data });
      }
    }

    // 🟢 Депозит
    if (type === 'deposit') {
      const lead = await findLead(clickId, email, headers);
      if (!lead) {
        throw new Error('Лид не найден по click_id или email');
      }

      const contactName = generateContactName(lead, clickId);

      await axios.put(
        'https://www.zohoapis.eu/crm/v2/Leads',
        {
          data: [{ id: lead.id, Lead_Status: 'FTD' }]
        },
        { headers }
      );

      const contactCreateResp = await axios.post(
        'https://www.zohoapis.eu/crm/v2/Contacts',
        {
          data: [{
            Last_Name: contactName,
            Email: isValidEmail(lead.Email) ? lead.Email : undefined,
            First_Name: lead.First_Name,
            click_id_Alanbase: clickId
          }]
        },
        { headers }
      );

      const contactId = contactCreateResp.data.data[0]?.details?.id;
      if (!contactId) throw new Error('Не удалось создать контакт');

      const dealCreateResp = await axios.post(
        'https://www.zohoapis.eu/crm/v2/Deals',
        {
          data: [{
            Deal_Name: `Retention Deal ${contactName}`,
            Stage: '0. FIRST DEPOSIT',
            Amount: Number(amount || value || 0),
            Currency: currency,
            Contact_Name: contactId,
            Email: isValidEmail(lead.Email) ? lead.Email : undefined,
            click_id_Alanbase: clickId
          }]
        },
        { headers }
      );

      const dealId = dealCreateResp.data.data[0]?.details?.id;
      if (!dealId) throw new Error('Не удалось создать сделку');

      let isFirstDeposit = false;
      try {
        const dealDetailsResp = await axios.get(
          `https://www.zohoapis.eu/crm/v2/Deals/${dealId}`,
          { headers }
        );
        isFirstDeposit = !dealDetailsResp.data.data[0]?.ftd;
      } catch (e) {
        console.warn('⚠ Не удалось проверить поле ftd в сделке.');
      }

      const depositData = {
        Name: `Депозит на сумму ${amount || value}`,
        amount: Number(amount || value),
        contact: contactId,
        Retention: dealId,
        lead: lead.id,
        Currency: currency,
        Email: isValidEmail(lead.Email) ? lead.Email : undefined
      };

      if (isFirstDeposit) {
        depositData.Description = 'FTD';
      }

      const depositResp = await axios.post(
        'https://www.zohoapis.eu/crm/v2/deposits',
        { data: [depositData] },
        { headers }
      );

      return res.json({
        success: true,
        leadUpdated: true,
        contactId,
        dealId,
        deposit: depositResp.data
      });
    }

    // 🔁 Повторный депозит
    if (type === 'redeposit') {
      const contact = await findContact(clickId, email, headers);
      if (!contact) throw new Error('Контакт не найден');
      const deal = await findDeal(contact.id, clickId, email, headers);
      if (!deal) throw new Error('Retention-сделка не найдена');

      const depositResp = await axios.post(
        'https://www.zohoapis.eu/crm/v2/deposits',
        {
          data: [{
            Name: `Повторный депозит на сумму ${amount || value}`,
            amount: amount || value,
            contact: contact.id,
            Retention: deal.id,
            Currency: currency,
            Email: email
          }]
        },
        { headers }
      );

      return res.json({ success: true, deposit: depositResp.data });
    }

    // 💰 Вывод средств
    if (type === 'withdrawal') {
      const contact = await findContact(clickId, email, headers);
      if (!contact) throw new Error('Контакт не найден');
      const deal = await findDeal(contact.id, clickId, email, headers);
      if (!deal) throw new Error('Retention-сделка не найдена');

      const withdrawalResp = await axios.post(
        'https://www.zohoapis.eu/crm/v2/withdrawals',
        {
          data: [{
            Name: `Вывод на сумму ${amount || value}`,
            amount: amount || value,
            contact: contact.id,
            Retention: deal.id,
            Currency: currency,
            Email: email
          }]
        },
        { headers }
      );

      return res.json({ success: true, withdrawal: withdrawalResp.data });
    }

    return res.status(400).json({ success: false, error: 'Неизвестный тип события' });
  } catch (error) {
    console.error('Ошибка обработки запроса:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error?.response?.data || error.message,
      details: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
