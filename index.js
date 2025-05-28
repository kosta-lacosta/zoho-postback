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

// Основная часть обработки депозита (замените существующую)
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
      Lead_Status: lead.Lead_Status
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
        data: [{ id: lead.id, Lead_Status: 'FTD' }]
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
