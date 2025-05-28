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

// Функция поиска лида по click_id или email
async function findLead(clickId, email, headers) {
  try {
    // Сначала ищем по click_id
    if (clickId) {
      const leadResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Leads/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (leadResp.data?.data?.[0]) {
        return leadResp.data.data[0];
      }
    }
    
    // Если не найден по click_id, ищем по email
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

// Функция поиска контакта по click_id или email
async function findContact(clickId, email, headers) {
  try {
    // Сначала ищем по click_id
    if (clickId) {
      const contactResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Contacts/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (contactResp.data?.data?.[0]) {
        return contactResp.data.data[0];
      }
    }
    
    // Если не найден по click_id, ищем по email
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

// Функция поиска сделки по контакту или лиду
async function findDeal(contactId, clickId, email, headers) {
  try {
    // Если есть контакт, ищем по Contact_Name
    if (contactId) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(Contact_Name:equals:${contactId})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) {
        return dealResp.data.data[0];
      }
    }
    
    // Если нет контакта, ищем сделку по click_id
    if (clickId) {
      const dealResp = await axios.get(
        `https://www.zohoapis.eu/crm/v2/Deals/search?criteria=(click_id_Alanbase:equals:${clickId})`,
        { headers }
      );
      if (dealResp.data?.data?.[0]) {
        return dealResp.data.data[0];
      }
    }
    
    // Если и по click_id не найдена, ищем по email
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
  const email = const2;
  const typeMap = {
    reg: 'registration',
    dep: 'deposit',
    red: 'redeposit',
    wd: 'withdrawal'
  };

  const type = typeMap[rawType || goal] || 'unknown';

  if (!clickId && !email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Должен быть передан либо click_id (id/custom1/sub_id1), либо email (const2)' 
    });
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
      let contactId = null;
      let leadId = null;
      let retentionId = null;

      // Сначала ищем контакт
      const contact = await findContact(clickId, email, headers);
      
      if (contact) {
        // Если контакт найден, ищем сделку для этого контакта
        contactId = contact.id;
        const deal = await findDeal(contactId, clickId, email, headers);
        if (!deal) {
          throw new Error('Сделка не найдена для контакта');
        }
        retentionId = deal.id;
      } else {
        // Если контакт не найден, ищем лид
        const lead = await findLead(clickId, email, headers);
        if (!lead) {
          throw new Error('Лид не найден ни по click_id, ни по email');
        }
        
        // КОНВЕРТИРУЕМ ЛИД В КОНТАКТ И СДЕЛКУ
        const convertResp = await axios.post(
          `https://www.zohoapis.eu/crm/v2/Leads/${lead.id}/actions/convert`,
          {
            data: [{
              overwrite: true,
              notify_lead_owner: false,
              notify_new_entity_owner: false,
              Contacts: {
                Last_Name: lead.Last_Name || lead.Email || `Contact ${clickId}`,
                Email: lead.Email,
                click_id_Alanbase: lead.click_id_Alanbase || clickId
              },
              Deals: {
                Deal_Name: `Retention Deal for ${lead.Last_Name || lead.Email || clickId}`,
                Stage: 'Qualification',
                click_id_Alanbase: lead.click_id_Alanbase || clickId,
                Email: lead.Email
              }
            }]
          },
          { headers }
        );

        if (!convertResp.data?.data?.[0]) {
          throw new Error('Не удалось конвертировать лид');
        }

        const convertedData = convertResp.data.data[0];
        contactId = convertedData.Contacts;
        retentionId = convertedData.Deals;
        
        console.log('Лид успешно конвертирован:', {
          leadId: lead.id,
          contactId,
          dealId: retentionId
        });
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
            Email: email
          }]
        },
        { headers }
      );

      return res.json({ success: true, deposit: depositResp.data });
    }

    // 🔁 Повторный депозит / Вывод
    if (type === 'redeposit' || type === 'withdrawal') {
      // Ищем контакт по click_id или email
      const contact = await findContact(clickId, email, headers);
      if (!contact) {
        throw new Error('Контакт не найден ни по click_id, ни по email');
      }

      // Ищем сделку для контакта
      const deal = await findDeal(contact.id, clickId, email, headers);
      if (!deal) {
        throw new Error('Retention-сделка не найдена для контакта');
      }

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
            Email: email
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
    res.status(500).json({ 
      success: false, 
      error: error?.response?.data || error.message,
      details: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
