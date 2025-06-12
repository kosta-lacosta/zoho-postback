// Обработчик Alanbase постбэков (полный исправленный index.js)
import express from 'express';
import axios from 'axios';

const app = express();
const port = process.env.PORT || 3000;

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
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
  } catch (error) {
    throw new Error('Ошибка получения токена: ' + (error?.response?.data?.error || error.message));
  }
}

async function findLead(clickId, email, headers) {
  try {
    if (clickId) {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (leadResp.data?.data?.[0]) return leadResp.data.data[0];
    }
    if (email) {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(Email:equals:${email})`,
        { headers }
      );
      if (leadResp.data?.data?.[0]) return leadResp.data.data[0];
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
      if (contactResp.data?.data?.[0]) return contactResp.data.data[0];
    }
    if (email) {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(Email:equals:${email})`,
        { headers }
      );
      if (contactResp.data?.data?.[0]) return contactResp.data.data[0];
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
      if (dealResp.data?.data?.[0]) return dealResp.data.data[0];
    }
    if (clickId) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) return dealResp.data.data[0];
    }
    if (email) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Email:equals:${email})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) return dealResp.data.data[0];
    }
    return null;
  } catch (error) {
    console.error('Ошибка поиска сделки:', error?.response?.data || error.message);
    return null;
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length >= 5;
}

function generateContactName(lead, clickId) {
  if (lead.Last_Name && lead.Last_Name.trim() && lead.Last_Name !== lead.Email) return lead.Last_Name.trim();
  if (lead.First_Name && lead.First_Name.trim()) return lead.First_Name.trim();
  if (lead.Email && isValidEmail(lead.Email)) return lead.Email.split('@')[0];
  if (clickId && clickId.toString().trim()) return `Contact_${clickId}`;
  return 'Unknown Contact';
}

// основной обработчик
app.get('/api/alanbase', async (req, res) => {
  const { id, status, value, amount, goal, currency, custom1, const2, sub_id1, type: rawType } = req.query;
  const clickId = id || custom1 || sub_id1;
  const email = const2;
  const typeMap = { reg: 'registration', dep: 'deposit', red: 'redeposit', wd: 'withdrawal' };
  const type = typeMap[rawType || goal] || 'unknown';

  if (!clickId && !email) {
    return res.status(400).json({ success: false, error: 'Должен быть передан либо click_id, либо email' });
  }

  try {
    const token = await getAccessToken();
    const headers = { Authorization: `Zoho-oauthtoken ${token}` };

    if (type === 'registration') {
      const lead = await findLead(clickId, email, headers);
      if (lead) {
        const updateResp = await axios.put('https://www.zohoapis.eu/crm/v2/Leads', {
          data: [{ id: lead.id, Lead_Status: 'Registered' }]
        }, { headers });
        return res.json({ success: true, updated: updateResp.data });
      } else {
        const createResp = await axios.post('https://www.zohoapis.eu/crm/v2/Leads', {
          data: [{
            Last_Name: email || `Reg ${clickId}`,
            click_id_Alanbase: clickId,
            amount: amount || value || 0,
            Lead_Status: 'Registered',
            Currency: currency,
            type: 'registration',
            Email: email
          }]
        }, { headers });
        return res.json({ success: true, created: createResp.data });
      }
    }

    if (type === 'deposit') {
      let contact = await findContact(clickId, email, headers);
      let deal = await findDeal(contact?.id, clickId, email, headers);
      let lead = await findLead(clickId, email, headers);

      if (contact && deal) {
        const depositResp = await axios.post('https://www.zohoapis.eu/crm/v2/deposits', {
          data: [{
            Name: `Депозит на сумму ${amount || value}`,
            amount: Number(amount || value),
            contact: contact.id,
            Retention: deal.id,
            Currency: currency,
            Email: isValidEmail(email) ? email : undefined
          }]
        }, { headers });
        return res.json({ success: true, deposit: depositResp.data });
      }

      if (!lead) throw new Error('Не найден ни контакт, ни лид');

      await axios.put('https://www.zohoapis.eu/crm/v2/Leads', {
        data: [{ id: lead.id, Status: 'FTD' }]
      }, { headers });

      if (!contact) {
        const contactResp = await axios.post('https://www.zohoapis.eu/crm/v2/Contacts', {
          data: [{
            Last_Name: generateContactName(lead, clickId),
            Email: isValidEmail(lead.Email) ? lead.Email : undefined,
            First_Name: lead.First_Name,
            click_id_Alanbase: clickId
          }]
        }, { headers });
        contact = { id: contactResp.data.data[0].details.id };
      }

      if (!deal) {
        const dealResp = await axios.post('https://www.zohoapis.eu/crm/v2/Deals', {
          data: [{
            Deal_Name: `Retention Deal ${clickId}`,
            Stage: '0. FIRST DEPOSIT',
            Amount: Number(amount || value),
            Currency: currency,
            Contact_Name: contact.id,
            Email: isValidEmail(lead.Email) ? lead.Email : undefined,
            click_id_Alanbase: clickId
          }]
        }, { headers });
        deal = { id: dealResp.data.data[0].details.id };
      }

      const depositResp = await axios.post('https://www.zohoapis.eu/crm/v2/deposits', {
        data: [{
          Name: `Депозит на сумму ${amount || value}`,
          amount: Number(amount || value),
          contact: contact.id,
          Retention: deal.id,
          lead: lead.id,
          Currency: currency,
          Email: isValidEmail(lead.Email) ? lead.Email : undefined,
          Description: 'FTD'
        }]
      }, { headers });

      return res.json({ success: true, createdContact: contact.id, createdDeal: deal.id, deposit: depositResp.data });
    }

    if (type === 'redeposit' || type === 'withdrawal') {
      let contact = await findContact(clickId, email, headers);
      let deal = null;

      if (!contact) {
        const existingDeal = await findDeal(null, clickId, null, headers);
        if (existingDeal && existingDeal.Contact_Name?.id) {
          contact = { id: existingDeal.Contact_Name.id };
          deal = existingDeal;
        }
      }

      if (!contact) throw new Error('Контакт не найден ни по click_id, ни по email');
      if (!deal) {
        deal = await findDeal(contact.id, clickId, email, headers);
        if (!deal) throw new Error('Retention-сделка не найдена для контакта');
      }

      const module = type === 'redeposit' ? 'deposits' : 'withdrawals';
      const recordName = type === 'redeposit' ? `Повторный депозит на сумму ${amount || value}` : `Вывод на сумму ${amount || value}`;

      const recordResp = await axios.post(`https://www.zohoapis.eu/crm/v2/${module}`, {
        data: [{
          Name: recordName,
          amount: Number(amount || value),
          contact: contact.id,
          Retention: deal.id,
          Currency: currency,
          Email: isValidEmail(email) ? email : undefined
        }]
      }, { headers });

      return res.json({ success: true, type, record: recordResp.data });
    }

    return res.status(400).json({ success: false, error: 'Неизвестный тип события' });
  } catch (error) {
    console.error('Ошибка обработки запроса:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: error?.response?.data || error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
