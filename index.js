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

// Функция валидации email
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length >= 5;
}

// Функция генерации имени контакта (улучшенная версия)
function generateContactName(lead, clickId) {
  // Приоритет: Last_Name > First_Name > часть email > click_id
  if (lead.Last_Name && lead.Last_Name.trim() && lead.Last_Name !== lead.Email) {
    return lead.Last_Name.trim();
  }
  if (lead.First_Name && lead.First_Name.trim()) {
    return lead.First_Name.trim();
  }
  
  // Если имени нет, но есть валидный email - берем часть до @
  if (lead.Email && isValidEmail(lead.Email)) {
    const emailPart = lead.Email.split('@')[0];
    if (emailPart && emailPart.length > 0) {
      return emailPart;
    }
  }
  
  // Если ничего нет - используем click_id или дефолтное значение
  if (clickId && clickId.toString().trim()) {
    return `Contact_${clickId}`;
  }
  
  return 'Unknown Contact';
}

// Функция валидации данных для конвертации
function validateConversionData(lead, clickId) {
  const errors = [];
  
  // Проверяем обязательные поля для контакта
  const contactName = generateContactName(lead, clickId);
  if (!contactName || contactName.length < 2) {
    errors.push('Невозможно сгенерировать валидное имя контакта');
  }
  
  // Проверяем email если он присутствует
  if (lead.Email && !isValidEmail(lead.Email)) {
    errors.push(`Невалидный email: ${lead.Email}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    contactName
  };
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
  const contact = await findContact(clickId, email, headers);
  let deal = null;

  if (contact) {
    deal = await findDeal(contact.id, clickId, email, headers);

    if (!deal) {
      // Контакт есть, но сделки нет — создаём сделку
      const dealResp = await axios.post(
        'https://www.zohoapis.eu/crm/v2/Deals',
        {
          data: [{
            Deal_Name: `Retention Deal ${contact.Last_Name || clickId}`,
            Stage: '0. FIRST DEPOSIT',
            Amount: Number(amount || value || 0),
            Currency: currency,
            Contact_Name: contact.id,
            Email: isValidEmail(email) ? email : undefined,
            click_id_Alanbase: clickId
          }]
        },
        { headers }
      );
      deal = { id: dealResp.data.data[0].details.id };
    }

    // Проверим поле ftd
    let isFirstDeposit = false;
    try {
      const dealDetails = await axios.get(`https://www.zohoapis.eu/crm/v2/Deals/${deal.id}`, { headers });
      isFirstDeposit = !dealDetails.data.data[0]?.ftd;
    } catch (e) {
      console.warn('⚠ Не удалось получить поле ftd');
    }

    const depositData = {
      Name: `Депозит на сумму ${amount || value}`,
      amount: Number(amount || value),
      contact: contact.id,
      Retention: deal.id,
      Currency: currency,
      Email: isValidEmail(email) ? email : undefined
    };
    if (isFirstDeposit) depositData.Description = 'FTD';

    const depositResp = await axios.post(
      'https://www.zohoapis.eu/crm/v2/deposits',
      { data: [depositData] },
      { headers }
    );

    return res.json({ success: true, contactId: contact.id, dealId: deal.id, deposit: depositResp.data });
  }

  // Если контакта нет — ищем лид
  const lead = await findLead(clickId, email, headers);
  if (!lead) {
    throw new Error('Не найден ни контакт, ни лид по click_id/email');
  }

  // Обновляем статус лида
  await axios.put(
    'https://www.zohoapis.eu/crm/v2/Leads',
    {
      data: [{ id: lead.id, Status: 'FTD' }]
    },
    { headers }
  );

  const contactName = generateContactName(lead, clickId);

  const contactResp = await axios.post(
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
  const contactId = contactResp.data.data[0]?.details?.id;

  const dealResp = await axios.post(
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
  const dealId = dealResp.data.data[0]?.details?.id;

  const depositResp = await axios.post(
    'https://www.zohoapis.eu/crm/v2/deposits',
    {
      data: [{
        Name: `Депозит на сумму ${amount || value}`,
        amount: Number(amount || value),
        contact: contactId,
        Retention: dealId,
        lead: lead.id,
        Currency: currency,
        Email: isValidEmail(lead.Email) ? lead.Email : undefined,
        Description: 'FTD'
      }]
    },
    { headers }
  );

  return res.json({
    success: true,
    createdContact: contactId,
    createdDeal: dealId,
    deposit: depositResp.data
  });
}

// 🔁 Повторный депозит
    if (type === 'redeposit') {
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

    // ❌ Неизвестный тип
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
