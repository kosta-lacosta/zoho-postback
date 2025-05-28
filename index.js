// 🟢 Депозит - исправленная версия
if (type === 'deposit') {
  // Сначала ищем лид по click_id или email
  const lead = await findLead(clickId, email, headers);
  
  if (lead) {
    console.log('Найден лид для депозита:', {
      id: lead.id,
      Last_Name: lead.Last_Name,
      Email: lead.Email,
      click_id_Alanbase: lead.click_id_Alanbase,
      Lead_Status: lead.Lead_Status
    });

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

    // Подготавливаем данные для конвертации с обязательными полями
    const convertData = {
      overwrite: true,
      notify_lead_owner: false,
      notify_new_entity_owner: false,
      Contacts: {
        // Обязательное поле - имя контакта
        Last_Name: lead.Last_Name || lead.Email?.split('@')[0] || `Contact_${clickId}` || 'Unknown'
      },
      Deals: {
        // Обязательные поля для сделки
        Deal_Name: `Retention Deal ${lead.Last_Name || lead.Email || clickId}`,
        Stage: 'Qualification'
      }
    };

    // Добавляем email только если он валидный
    if (lead.Email && lead.Email.includes('@') && lead.Email.length > 5) {
      convertData.Contacts.Email = lead.Email;
      convertData.Deals.Email = lead.Email;
    }

    // Добавляем click_id только если он есть и не пустой
    if (lead.click_id_Alanbase || clickId) {
      const clickIdValue = lead.click_id_Alanbase || clickId;
      if (clickIdValue && clickIdValue.toString().trim()) {
        convertData.Contacts.click_id_Alanbase = clickIdValue;
        convertData.Deals.click_id_Alanbase = clickIdValue;
      }
    }

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
        throw new Error(`Ошибка конвертации лида: ${errorDetails.message} (${errorDetails.code})`);
      }

      if (!convertResp.data?.data?.[0]) {
        throw new Error('Не удалось конвертировать лид - пустой ответ от API');
      }

      const convertedData = convertResp.data.data[0];
      console.log('Converted data structure:', JSON.stringify(convertedData, null, 2));
      
      let contactId, retentionId;
      
      // Проверяем все возможные варианты структуры ответа
      if (convertedData.details) {
        // Вариант 1: данные в details
        contactId = convertedData.details.Contacts?.id || convertedData.details.Contacts;
        retentionId = convertedData.details.Deals?.id || convertedData.details.Deals;
      } else if (convertedData.Contacts || convertedData.Deals) {
        // Вариант 2: данные напрямую
        contactId = convertedData.Contacts?.id || convertedData.Contacts;
        retentionId = convertedData.Deals?.id || convertedData.Deals;
      } else if (convertedData.message && convertedData.message === 'success') {
        // Вариант 3: успешная конвертация, но нужно искать созданные записи
        console.log('Конвертация успешна, ищем созданные записи...');
        
        // Даем время на обработку в Zoho
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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

      // Если все еще не нашли ID после конвертации, создаем контакт и сделку вручную
      if (!contactId || !retentionId) {
        console.log('Конвертация не вернула ID, создаем записи вручную...');
        
        try {
          // Создаем контакт вручную
          if (!contactId) {
            const contactCreateData = {
              Last_Name: lead.Last_Name || lead.Email?.split('@')[0] || `Contact_${clickId}` || 'Unknown'
            };

            if (lead.Email && lead.Email.includes('@') && lead.Email.length > 5) {
              contactCreateData.Email = lead.Email;
            }
            if (lead.click_id_Alanbase || clickId) {
              const clickIdValue = lead.click_id_Alanbase || clickId;
              if (clickIdValue && clickIdValue.toString().trim()) {
                contactCreateData.click_id_Alanbase = clickIdValue;
              }
            }

            const contactCreateResp = await axios.post(
              'https://www.zohoapis.eu/crm/v2/Contacts',
              { data: [contactCreateData] },
              { headers }
            );

            if (contactCreateResp.data?.data?.[0]?.details?.id) {
              contactId = contactCreateResp.data.data[0].details.id;
              console.log('Контакт создан вручную:', contactId);
            }
          }

          // Создаем сделку вручную
          if (contactId && !retentionId) {
            const dealCreateData = {
              Deal_Name: `Retention Deal ${lead.Last_Name || lead.Email || clickId}`,
              Stage: 'Qualification',
              Contact_Name: contactId
            };

            if (lead.click_id_Alanbase || clickId) {
              const clickIdValue = lead.click_id_Alanbase || clickId;
              if (clickIdValue && clickIdValue.toString().trim()) {
                dealCreateData.click_id_Alanbase = clickIdValue;
              }
            }
            if (lead.Email && lead.Email.includes('@') && lead.Email.length > 5) {
              dealCreateData.Email = lead.Email;
            }

            const dealCreateResp = await axios.post(
              'https://www.zohoapis.eu/crm/v2/Deals',
              { data: [dealCreateData] },
              { headers }
            );

            if (dealCreateResp.data?.data?.[0]?.details?.id) {
              retentionId = dealCreateResp.data.data[0].details.id;
              console.log('Сделка создана вручную:', retentionId);
            }
          }
        } catch (manualCreateError) {
          console.error('Ошибка ручного создания:', manualCreateError?.response?.data || manualCreateError.message);
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

      // Обновляем сумму депозита в сделке, если есть сумма
      if (retentionId && (amount || value)) {
        try {
          await axios.put(
            'https://www.zohoapis.eu/crm/v2/Deals',
            {
              data: [{
                id: retentionId,
                Amount: Number(amount || value) // Используем стандартное поле Amount
              }]
            },
            { headers }
          );
          console.log('Сумма депозита обновлена в сделке');
        } catch (amountUpdateError) {
          console.error('Ошибка обновления суммы:', amountUpdateError?.response?.data || amountUpdateError.message);
        }
      }

      // Создаем запись депозита
      try {
        const depositResp = await axios.post(
          'https://www.zohoapis.eu/crm/v2/deposits',
          {
            data: [{
              Name: `Депозит на сумму ${amount || value || 0}`,
              amount: Number(amount || value || 0),
              contact: contactId,
              Retention: retentionId,
              Currency: currency || 'USD',
              Email: lead.Email
            }]
          },
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
      
      // Если конвертация не удалась, пробуем создать контакт и сделку вручную
      console.log('Конвертация не удалась, создаем записи полностью вручную...');
      
      try {
        // Создаем контакт
        const contactCreateData = {
          Last_Name: lead.Last_Name || lead.Email?.split('@')[0] || `Contact_${clickId}` || 'Unknown'
        };

        if (lead.Email && lead.Email.includes('@') && lead.Email.length > 5) {
          contactCreateData.Email = lead.Email;
        }
        if (lead.click_id_Alanbase || clickId) {
          const clickIdValue = lead.click_id_Alanbase || clickId;
          if (clickIdValue && clickIdValue.toString().trim()) {
            contactCreateData.click_id_Alanbase = clickIdValue;
          }
        }

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
          throw new Error('Не удалось создать контакт');
        }

        // Создаем сделку
        const dealCreateData = {
          Deal_Name: `Retention Deal ${lead.Last_Name || lead.Email || clickId}`,
          Stage: 'Qualification',
          Contact_Name: contactId,
          Amount: Number(amount || value || 0)
        };

        if (lead.click_id_Alanbase || clickId) {
          const clickIdValue = lead.click_id_Alanbase || clickId;
          if (clickIdValue && clickIdValue.toString().trim()) {
            dealCreateData.click_id_Alanbase = clickIdValue;
          }
        }
        if (lead.Email && lead.Email.includes('@') && lead.Email.length > 5) {
          dealCreateData.Email = lead.Email;
        }

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
          throw new Error('Не удалось создать сделку');
        }

        // Создаем запись депозита
        const depositResp = await axios.post(
          'https://www.zohoapis.eu/crm/v2/deposits',
          {
            data: [{
              Name: `Депозит на сумму ${amount || value || 0}`,
              amount: Number(amount || value || 0),
              contact: contactId,
              Retention: retentionId,
              Currency: currency || 'USD',
              Email: lead.Email
            }]
          },
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
        throw convertError; // Возвращаем исходную ошибку конвертации
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
    const depositResp = await axios.post(
      'https://www.zohoapis.eu/crm/v2/deposits',
      {
        data: [{
          Name: `Депозит на сумму ${amount || value}`,
          amount: Number(amount || value || 0),
          contact: contact.id,
          Retention: deal.id,
          Currency: currency || 'USD',
          Email: email
        }]
      },
      { headers }
    );

    return res.json({ 
      success: true, 
      deposit: depositResp.data 
    });
  }
}
