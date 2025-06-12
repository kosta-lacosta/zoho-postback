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
            data: [{ id: lead.id, Status: 'Registered' }]
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
              Status: 'Registered',
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
      // Сначала ищем лид по click_id или email
      const lead = await findLead(clickId, email, headers);
      
      if (lead) {
        console.log('Найден лид для депозита:', {
          id: lead.id,
          Last_Name: lead.Last_Name,
          First_Name: lead.First_Name,
          Email: lead.Email,
          click_id_Alanbase: lead.click_id_Alanbase,
          Status: lead.Status
        });

        // Валидируем данные перед конвертацией
        const validation = validateConversionData(lead, clickId);
        if (!validation.isValid) {
          console.error('Ошибки валидации данных для конвертации:', validation.errors);
          throw new Error(`Данные лида невалидны для конвертации: ${validation.errors.join(', ')}`);
        }

        // Если лид найден - обновляем его в стадию FTD
        await axios.put(
          'https://www.zohoapis.eu/crm/v2/Leads',
          {
            data: [{ id: lead.id, Status: 'FTD' }]
          },
          { headers }
        );
        
        // КОНВЕРТИРУЕМ ЛИД В КОНТАКТ И СДЕЛКУ
        console.log('Конвертируем лид:', lead.id);

        // Подготавливаем данные для конвертации с улучшенной валидацией
        const contactName = validation.contactName;
        
        const convertData = {
          overwrite: true,
          notify_lead_owner: false,
          notify_new_entity_owner: false,
          Contacts: {
            Last_Name: contactName
          },
          Deals: {
            Deal_Name: `Retention Deal ${contactName}`,
            Stage: '0. FIRST DEPOSIT'
          }
        };

        // Добавляем email только если он валидный
        if (lead.Email && isValidEmail(lead.Email)) {
          convertData.Contacts.Email = lead.Email;
          convertData.Deals.Email = lead.Email;
        }

        // Добавляем click_id если он есть и валидный
        if (clickId && clickId.toString().trim() && clickId.toString().length > 0) {
          convertData.Contacts.click_id_Alanbase = clickId.toString();
          convertData.Deals.click_id_Alanbase = clickId.toString();
        }

        // Добавляем сумму в сделку
        const depositAmount = Number(amount || value || 0);
        if (depositAmount > 0) {
          convertData.Deals.Amount = depositAmount;
        }

        // Добавляем валюту
        if (currency && currency.trim()) {
          convertData.Deals.Currency = currency.trim();
        }

        // Дополнительные проверки перед отправкой
        console.log('Данные для конвертации:', JSON.stringify(convertData, null, 2));

        try {
          const convertResp = await axios.post(
            `https://www.zohoapis.eu/crm/v2/Leads/${lead.id}/actions/convert`,
            {
              data: [convertData]
            },
            { headers }
          );

          console.log('Convert API Response:', JSON.stringify(convertResp.data, null, 2));

          // Проверяем на ошибки в ответе
          if (convertResp.data?.data?.[0]?.status === 'error') {
            const errorDetails = convertResp.data.data[0];
            console.error('Ошибка конвертации:', errorDetails);
            
            // Логируем подробности для диагностики
            console.error('Данные лида, которые привели к ошибке:', {
              leadId: lead.id,
              leadData: lead,
              convertData: convertData
            });
            
            throw new Error(`Ошибка конвертации лида: ${errorDetails.message} (${errorDetails.code})`);
          }

          if (!convertResp.data?.data?.[0]) {
            throw new Error('Не удалось конвертировать лид - пустой ответ от API');
          }

          const convertedData = convertResp.data.data[0];
          
          let contactId, retentionId;
          
          // Проверяем все возможные варианты структуры ответа
          if (convertedData.details) {
            contactId = convertedData.details.Contacts?.id || convertedData.details.Contacts;
            retentionId = convertedData.details.Deals?.id || convertedData.details.Deals;
          } else if (convertedData.Contacts || convertedData.Deals) {
            contactId = convertedData.Contacts?.id || convertedData.Contacts;
            retentionId = convertedData.Deals?.id || convertedData.Deals;
          } else if (convertedData.message && convertedData.message === 'success') {
            console.log('Конвертация успешна, ищем созданные записи...');
            
            // Даем время на обработку в Zoho
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Ищем контакт по email или click_id
            const createdContact = await findContact(clickId, email, headers);
            if (createdContact) {
              contactId = createdContact.id;
              console.log('Найден созданный контакт:', contactId);
            }
            
            // Ищем сделку по контакту
            if (contactId) {
              const createdDeal = await findDeal(contactId, clickId, email, headers);
              if (createdDeal) {
                retentionId = createdDeal.id;
                console.log('Найдена созданная сделка:', retentionId);
              }
            }
          }

          if (!contactId || !retentionId) {
            console.error('Полная структура ответа конвертации:', JSON.stringify(convertResp.data, null, 2));
            throw new Error('Не удалось получить ID созданных контакта или сделки после конвертации');
          }
          
          console.log('Лид успешно конвертирован:', {
            leadId: lead.id,
            contactId,
            dealId: retentionId
          });

          // Создаем запись депозита
          try {
            const depositData = {
              Name: `Депозит на сумму ${depositAmount}`,
              amount: depositAmount,
              contact: contactId,
              Retention: retentionId
            };

            // Добавляем валюту если есть
            if (currency && currency.trim()) {
              depositData.Currency = currency.trim();
            }

            // Добавляем email если валидный
            if (lead.Email && isValidEmail(lead.Email)) {
              depositData.Email = lead.Email;
            }

            const depositResp = await axios.post(
              'https://www.zohoapis.eu/crm/v2/deposits',
              { data: [depositData] },
              { headers }
            );

            return res.json({ 
              success: true, 
              leadUpdated: true,
              converted: true,
              contactId: contactId,
              dealId: retentionId,
              deposit: depositResp.data 
            });
          } catch (depositError) {
            console.error('Ошибка создания депозита:', depositError?.response?.data || depositError.message);
            
            // Возвращаем успех конвертации, даже если депозит не создался
            return res.json({ 
              success: true, 
              leadUpdated: true,
              converted: true,
              contactId: contactId,
              dealId: retentionId,
              depositError: depositError?.response?.data || depositError.message
            });
          }

        } catch (convertError) {
          console.error('Ошибка конвертации лида:', convertError?.response?.data || convertError.message);
          
          // Если конвертация не удалась, создаем записи вручную
          console.log('Конвертация не удалась, создаем записи вручную...');
          
          try {
            // Создаем контакт с более безопасными данными
            const contactCreateData = {
              Last_Name: contactName
            };

            // Добавляем дополнительные поля только если они валидны
            if (lead.Email && isValidEmail(lead.Email)) {
              contactCreateData.Email = lead.Email;
            }
            
            if (lead.First_Name && lead.First_Name.trim()) {
              contactCreateData.First_Name = lead.First_Name.trim();
            }
            
            if (clickId && clickId.toString().trim()) {
              contactCreateData.click_id_Alanbase = clickId.toString();
            }

            console.log('Создаем контакт с данными:', contactCreateData);

            const contactCreateResp = await axios.post(
              'https://www.zohoapis.eu/crm/v2/Contacts',
              { data: [contactCreateData] },
              { headers }
            );

            let contactId;
            if (contactCreateResp.data?.data?.[0]?.details?.id) {
              contactId = contactCreateResp.data.data[0].details.id;
              console.log('Контакт создан после неудачной конвертации:', contactId);
            } else {
              console.error('Ответ создания контакта:', JSON.stringify(contactCreateResp.data, null, 2));
              throw new Error('Не удалось создать контакт');
            }

            // Создаем сделку
            const dealCreateData = {
              Deal_Name: `Retention Deal ${contactName}`,
              Stage: '0. FIRST DEPOSIT',
              Contact_Name: contactId
            };

            const depositAmount = Number(amount || value || 0);
            if (depositAmount > 0) {
              dealCreateData.Amount = depositAmount;
            }

            if (clickId && clickId.toString().trim()) {
              dealCreateData.click_id_Alanbase = clickId.toString();
            }
            
            if (lead.Email && isValidEmail(lead.Email)) {
              dealCreateData.Email = lead.Email;
            }
            
            if (currency && currency.trim()) {
              dealCreateData.Currency = currency.trim();
            }

            console.log('Создаем сделку с данными:', dealCreateData);

            const dealCreateResp = await axios.post(
              'https://www.zohoapis.eu/crm/v2/Deals',
              { data: [dealCreateData] },
              { headers }
            );

            let retentionId;
            if (dealCreateResp.data?.data?.[0]?.details?.id) {
              retentionId = dealCreateResp.data.data[0].details.id;
              console.log('Сделка создана после неудачной конвертации:', retentionId);
            } else {
              console.error('Ответ создания сделки:', JSON.stringify(dealCreateResp.data, null, 2));
              throw new Error('Не удалось создать сделку');
            }

            // Создаем запись депозита
            const depositData = {
              Name: `Депозит на сумму ${depositAmount}`,
              amount: depositAmount,
              contact: contactId,
              Retention: retentionId
            };

            if (currency && currency.trim()) {
              depositData.Currency = currency.trim();
            }

            if (lead.Email && isValidEmail(lead.Email)) {
              depositData.Email = lead.Email;
            }

            const depositResp = await axios.post(
              'https://www.zohoapis.eu/crm/v2/deposits',
              { data: [depositData] },
              { headers }
            );

            return res.json({ 
              success: true, 
              leadUpdated: true,
              converted: false,
              manuallyCreated: true,
              contactId: contactId,
              dealId: retentionId,
              deposit: depositResp.data 
            });

          } catch (manualError) {
            console.error('Полная ошибка создания записей:', manualError?.response?.data || manualError.message);
            throw new Error(`Не удалось создать записи ни через конвертацию, ни вручную: ${manualError.message}`);
          }
        }
        
      } else {
        // Если лид не найден - ищем контакт и сделку
        const contact = await findContact(clickId, email, headers);
        if (!contact) {
          throw new Error('Не найден ни лид, ни контакт по click_id или email');
        }

        // Ищем сделку для контакта
        const deal = await findDeal(contact.id, clickId, email, headers);
        if (!deal) {
          throw new Error('Retention-сделка не найдена для контакта');
        }

        // Создаем депозит
        const depositAmount = Number(amount || value || 0);
        const depositData = {
          Name: `Депозит на сумму ${depositAmount}`,
          amount: depositAmount,
          contact: contact.id,
          Retention: deal.id
        };

        if (currency && currency.trim()) {
          depositData.Currency = currency.trim();
        }

        if (email && isValidEmail(email)) {
          depositData.Email = email;
        }

        const depositResp = await axios.post(
          'https://www.zohoapis.eu/crm/v2/deposits',
          { data: [depositData] },
          { headers }
        );

        return res.json({ 
          success: true, 
          deposit: depositResp.data 
        });
      }
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
