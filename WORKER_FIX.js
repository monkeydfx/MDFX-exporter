// ============================================
// ENDPOINT RESERVAR INSTALACIÓN (PRE-INSTALL)
// ============================================
// Llamada desde la app ANTES de instalar
// Reserva un installation_id para este usuario
// Genera un ID único y lo retorna
if (path === '/api/reserve-installation' && request.method === 'POST') {
  try {
    const data = await request.json().catch(() => ({}));
    const { userEmail, type, terminalId } = data;

    if (!userEmail || !type || !terminalId) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields',
        message: 'userEmail, type (MT4/MT5), y terminalId son requeridos'
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const emailLower = userEmail.toLowerCase();
    
    // 🔧 NUEVO FORMATO: ID_{MT4|MT5}_{terminalId}
    // El account se agregará después cuando el EA se registre
    const installationId = `ID_${type.toUpperCase()}_${terminalId.toUpperCase()}`;
    

    // 🔍 PASO 1: Validar que usuario existe, está activo, y tiene suscripción válida
    const userResult = await executeTursoQuery(
      'SELECT id, is_active, expires_at FROM users WHERE LOWER(email) = ?',
      [emailLower]
    );

    if (!userResult || userResult.rows.length === 0) {
      warn(`❌ Usuario no encontrado`);
      return new Response(JSON.stringify({ 
        error: 'User not found',
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const user = userResult.rows[0];
    const userId = user.id;

    // 🔍 Verificar que usuario está ACTIVO
    if (user.is_active !== 1 && user.is_active !== '1') {
      warn(`❌ Usuario inactivo`);
      return new Response(JSON.stringify({ 
        error: 'User not active',
        message: 'Usuario inactivo. Contacta al administrador.'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 🔍 Verificar SUSCRIPCIÓN no expirada
    if (user.expires_at) {
      const expiryDate = new Date(user.expires_at);
      const now = new Date();
      if (now > expiryDate) {
        warn(`❌ Suscripción expirada`);
        return new Response(JSON.stringify({ 
          error: 'Subscription expired',
          message: 'Suscripción expirada. Renueva para continuar.'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 🔍 PASO 2: Validar que este installation_id NO está vinculado a otro usuario
    // 🔧 CAMBIO CRÍTICO: Usar = (exacto) en lugar de LIKE para NO reutilizar registros viejos
    // Buscar SOLO el ID sin account en estado RESERVED
    let installationCheck = await executeTursoQuery(
      'SELECT id, user_id, installation_id, status FROM installations WHERE UPPER(installation_id) = ? LIMIT 1',
      [installationId]  // Busca EXACTO: ID_MT5_TERMINALID (sin account)
    );

    if (installationCheck && installationCheck.rows.length > 0) {
      const existing = installationCheck.rows[0];
      const existingUserId = existing.user_id;
      const existingStatus = existing.status;
      
      if (existingUserId !== userId) {
        // ❌ Otro usuario ya reclamo esta terminal
        error(`⛔️ BLOQUEADO: Usuario ${userId} intenta usar ${installationId} de usuario ${existingUserId}`);
        return new Response(JSON.stringify({ 
          error: 'Installation already claimed',
          message: `Esta instalación de MetaTrader ya está vinculada a otro usuario. No puedes instalar aquí.`
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // ✅ MISMO usuario intenta reservar NUEVAMENTE
      // Re-usar la reserva existente
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Instalación ya reservada',
        id: existing.id,
        installationId: installationId,
        status: 'already_reserved'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ✅ PASO 3: Crear NUEVA reserva
    // Generar ID único para el registro
    const installationId_record = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
    
    // Crear registro como RESERVED (no ACTIVE)
    // ⚠️ IMPORTANTE: installation_id es SIN account (será actualizado por EA)
    await executeTursoQuery(
      `INSERT INTO installations (id, installation_id, user_id, user_email, status, created_at) 
       VALUES (?, ?, ?, ?, 'RESERVED', ?)`,
      [installationId_record, installationId, userId, emailLower, new Date().toISOString()]
    );

    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Instalación reservada exitosamente',
      id: installationId_record,
      installationId: installationId,
      status: 'reserved'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
