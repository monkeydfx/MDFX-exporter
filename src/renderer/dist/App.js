"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
var _React = React,
  useState = _React.useState,
  useEffect = _React.useEffect,
  useRef = _React.useRef;
function App() {
  var _useState = useState([]),
    _useState2 = _slicedToArray(_useState, 2),
    terminals = _useState2[0],
    setTerminals = _useState2[1];
  var _useState3 = useState(false),
    _useState4 = _slicedToArray(_useState3, 2),
    scanning = _useState4[0],
    setScanning = _useState4[1];
  var _useState5 = useState({}),
    _useState6 = _slicedToArray(_useState5, 2),
    installing = _useState6[0],
    setInstalling = _useState6[1];
  var _useState7 = useState({}),
    _useState8 = _slicedToArray(_useState7, 2),
    uninstalling = _useState8[0],
    setUninstalling = _useState8[1];
  var _useState9 = useState({}),
    _useState0 = _slicedToArray(_useState9, 2),
    status = _useState0[0],
    setStatus = _useState0[1];
  var _useState1 = useState(''),
    _useState10 = _slicedToArray(_useState1, 2),
    userEmail = _useState10[0],
    setUserEmail = _useState10[1];
  var _useState11 = useState(null),
    _useState12 = _slicedToArray(_useState11, 2),
    expandedTerminal = _useState12[0],
    setExpandedTerminal = _useState12[1];
  var _useState13 = useState(false),
    _useState14 = _slicedToArray(_useState13, 2),
    showInfoModal = _useState14[0],
    setShowInfoModal = _useState14[1];
  var _useState15 = useState(false),
    _useState16 = _slicedToArray(_useState15, 2),
    showErrorModal = _useState16[0],
    setShowErrorModal = _useState16[1];
  var _useState17 = useState(''),
    _useState18 = _slicedToArray(_useState17, 2),
    errorMessage = _useState18[0],
    setErrorMessage = _useState18[1];
  var _useState19 = useState('info'),
    _useState20 = _slicedToArray(_useState19, 2),
    modalKind = _useState20[0],
    setModalKind = _useState20[1];
  var _useState21 = useState(false),
    _useState22 = _slicedToArray(_useState21, 2),
    showAdminModal = _useState22[0],
    setShowAdminModal = _useState22[1];
  var _useState23 = useState({
      open: false,
      title: 'Confirmar acción',
      message: '',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
      onConfirm: null
    }),
    _useState24 = _slicedToArray(_useState23, 2),
    confirmState = _useState24[0],
    setConfirmState = _useState24[1];
  var _useState25 = useState(false),
    _useState26 = _slicedToArray(_useState25, 2),
    installingManual = _useState26[0],
    setInstallingManual = _useState26[1];
  var emailInputRef = useRef(null);
  useEffect(function () {
    handleScan();
    // No auto-focus para que el usuario pueda escribir en cualquier campo
    _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
      var _window$electronAPI, _window$electronAPI$g, res, _t;
      return _regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            _context.p = 0;
            _context.n = 1;
            return (_window$electronAPI = window.electronAPI) === null || _window$electronAPI === void 0 || (_window$electronAPI$g = _window$electronAPI.getAdminStatus) === null || _window$electronAPI$g === void 0 ? void 0 : _window$electronAPI$g.call(_window$electronAPI);
          case 1:
            res = _context.v;
            if (res && res.success && res.isAdmin === false) {
              setShowAdminModal(true);
            }
            _context.n = 3;
            break;
          case 2:
            _context.p = 2;
            _t = _context.v;
          case 3:
            return _context.a(2);
        }
      }, _callee, null, [[0, 2]]);
    }))();
  }, []);

  // ✅ No forzar focus automáticamente - dejar que el usuario controle el foco
  useEffect(function () {
    var hasActiveOperations = Object.values(installing).some(function (v) {
      return v;
    }) || Object.values(uninstalling).some(function (v) {
      return v;
    });
    // Simplemente no hacer nada con el focus
  }, [installing, uninstalling]);
  var handleScan = /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
      var result, _t2;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.p = _context2.n) {
          case 0:
            setScanning(true);
            _context2.p = 1;
            _context2.n = 2;
            return window.electronAPI.clearCacheAndScan();
          case 2:
            result = _context2.v;
            if (result && result.success) {
              setTerminals(result.terminals || []);
            } else {
              showError('Error al escanear terminales');
            }
            _context2.n = 4;
            break;
          case 3:
            _context2.p = 3;
            _t2 = _context2.v;
            showError('Error: ' + _t2.message);
          case 4:
            _context2.p = 4;
            setScanning(false);
            return _context2.f(4);
          case 5:
            return _context2.a(2);
        }
      }, _callee2, null, [[1, 3, 4, 5]]);
    }));
    return function handleScan() {
      return _ref2.apply(this, arguments);
    };
  }();
  var handleOpenFolder = /*#__PURE__*/function () {
    var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(path) {
      var result, _t3;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.p = _context3.n) {
          case 0:
            if (path) {
              _context3.n = 1;
              break;
            }
            return _context3.a(2);
          case 1:
            _context3.p = 1;
            _context3.n = 2;
            return window.electronAPI.openTerminalFolder(path);
          case 2:
            result = _context3.v;
            if (!result.success) {
              showError('Error abriendo carpeta: ' + result.error);
            }
            _context3.n = 4;
            break;
          case 3:
            _context3.p = 3;
            _t3 = _context3.v;
            showError('Error: ' + _t3.message);
          case 4:
            return _context3.a(2);
        }
      }, _callee3, null, [[1, 3]]);
    }));
    return function handleOpenFolder(_x) {
      return _ref3.apply(this, arguments);
    };
  }();
  var showError = function showError(message) {
    var kind = message !== null && message !== void 0 && message.startsWith('✅') ? 'success' : message !== null && message !== void 0 && message.startsWith('⚠️') ? 'warning' : message !== null && message !== void 0 && message.startsWith('❌') ? 'error' : 'info';
    setModalKind(kind);
    setErrorMessage(message);
    setShowErrorModal(true);
  };
  var showConfirm = function showConfirm(_ref4) {
    var title = _ref4.title,
      message = _ref4.message,
      confirmLabel = _ref4.confirmLabel,
      cancelLabel = _ref4.cancelLabel,
      onConfirm = _ref4.onConfirm;
    setConfirmState({
      open: true,
      title: title || 'Confirmar acción',
      message: message || '',
      confirmLabel: confirmLabel || 'Confirmar',
      cancelLabel: cancelLabel || 'Cancelar',
      onConfirm: onConfirm || null
    });
  };

  // ✅ VALIDACIÓN 1: Validar FORMATO email (RFC 5322 simplificado)
  // Reglas:
  // - Debe tener al menos 1 carácter antes del @
  // - Debe tener @ obligatorio
  // - Debe tener al menos 1 carácter entre @ y .
  // - Debe tener un . después del @
  // - No puede tener espacios
  var validateEmailFormat = function validateEmailFormat(email) {
    if (!email) return false;
    var regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  // ✅ VALIDACIÓN 2: Validar email CON BASE DE DATOS
  // - Verifica si existe en BD
  // - Si es nuevo, lo crea automáticamente
  // - Retorna: { success: true/false, isNew: true/false, message: string }
  var validateEmailWithBackend = /*#__PURE__*/function () {
    var _ref5 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(email) {
      var result, err, _t4;
      return _regenerator().w(function (_context4) {
        while (1) switch (_context4.p = _context4.n) {
          case 0:
            _context4.p = 0;
            _context4.n = 1;
            return window.electronAPI.registerOrValidateEmail(email);
          case 1:
            result = _context4.v;
            if (result.success) {
              _context4.n = 2;
              break;
            }
            err = new Error(result.message || 'Email no existe en BD o no autorizado');
            err.errorCode = result.errorCode;
            throw err;
          case 2:
            return _context4.a(2, result);
          case 3:
            _context4.p = 3;
            _t4 = _context4.v;
            if (!_t4.errorCode && _t4.message) {
              _t4.errorCode = 'UNKNOWN';
            }
            throw _t4;
          case 4:
            return _context4.a(2);
        }
      }, _callee4, null, [[0, 3]]);
    }));
    return function validateEmailWithBackend(_x2) {
      return _ref5.apply(this, arguments);
    };
  }();
  var handleInstall = /*#__PURE__*/function () {
    var _ref6 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(terminalId) {
      var terminal, reservedInstallationId, executeInstall;
      return _regenerator().w(function (_context6) {
        while (1) switch (_context6.n) {
          case 0:
            terminal = terminals.find(function (t) {
              return t.id === terminalId;
            });
            reservedInstallationId = null; // ✅ VALIDACIÓN 1: Verificar que hay email ingresado
            if (userEmail) {
              _context6.n = 1;
              break;
            }
            showError('⚠️ Por favor ingresa un email\n\nEste email será vinculado a la terminal');
            return _context6.a(2);
          case 1:
            if (validateEmailFormat(userEmail)) {
              _context6.n = 2;
              break;
            }
            showError('❌ Email inválido\n\nFormato correcto: usuario@dominio.com');
            return _context6.a(2);
          case 2:
            if (!(terminal !== null && terminal !== void 0 && terminal.installed)) {
              _context6.n = 3;
              break;
            }
            showError('⚠️ Esta terminal ya tiene EA instalado\n\nDesinstala primero si quieres cambiar de email');
            return _context6.a(2);
          case 3:
            if (!installing[terminalId]) {
              _context6.n = 4;
              break;
            }
            return _context6.a(2);
          case 4:
            executeInstall = /*#__PURE__*/function () {
              var _ref7 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5() {
                var emailValidation, freshResult, freshTerminal, reserveResult, reserveMessage, _err, _err2, _err3, err, result, errorMsg, _errorMsg, errorCode, displayMsg, _t5, _t6, _t7;
                return _regenerator().w(function (_context5) {
                  while (1) switch (_context5.p = _context5.n) {
                    case 0:
                      setInstalling(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, true));
                      });
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '⏳ Validando email con servidor...'));
                      });
                      _context5.p = 1;
                      _context5.n = 2;
                      return validateEmailWithBackend(userEmail);
                    case 2:
                      emailValidation = _context5.v;
                      if (emailValidation.success) {
                        _context5.n = 3;
                        break;
                      }
                      throw new Error(emailValidation.message || 'Email no autorizado');
                    case 3:
                      // ✅ 🔄 VALIDACIÓN 5: REFRESCAR datos de la terminal
                      // ⚠️ CRÍTICO: El usuario puede haber cambiado de cuenta/broker en MT5
                      // sin notificarle a la app. Refrescamos para obtener datos REALES.
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '⏳ Refrescando datos de la terminal...'));
                      });
                      _context5.n = 4;
                      return window.electronAPI.scanSingleTerminal(terminalId);
                    case 4:
                      freshResult = _context5.v;
                      if (freshResult.success) {
                        _context5.n = 5;
                        break;
                      }
                      throw new Error('Terminal no encontrada durante el refresh. Intenta nuevamente.');
                    case 5:
                      freshTerminal = freshResult.terminal; // Actualizar el estado con los datos frescos
                      setTerminals(function (prev) {
                        return prev.map(function (t) {
                          return t.id === terminalId ? _objectSpread(_objectSpread({}, t), freshTerminal) : t;
                        });
                      });

                      // ✅ VALIDACIÓN 6: PRE-RESERVAR TERMINAL antes de instalar
                      // Esto genera un ID único y marca la terminal como reservada en el backend
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '⏳ Reservando terminal...'));
                      });
                      _context5.n = 6;
                      return window.electronAPI.reserveInstallation(terminalId, userEmail);
                    case 6:
                      reserveResult = _context5.v;
                      if (reserveResult.success) {
                        _context5.n = 10;
                        break;
                      }
                      reserveMessage = reserveResult.message || reserveResult.error || 'Error al reservar terminal';
                      if (!(reserveResult.errorCode === 'INSTALLATION_ALREADY_CLAIMED')) {
                        _context5.n = 7;
                        break;
                      }
                      _err = new Error('❌ Esta terminal ya está vinculada a otro usuario');
                      _err.errorCode = 'INSTALLATION_ALREADY_CLAIMED';
                      throw _err;
                    case 7:
                      if (!(reserveResult.errorCode === 'USER_NOT_FOUND')) {
                        _context5.n = 8;
                        break;
                      }
                      _err2 = new Error('❌ Usuario no encontrado');
                      _err2.errorCode = 'USER_NOT_FOUND';
                      throw _err2;
                    case 8:
                      if (!(reserveResult.errorCode === 'RATE_LIMIT')) {
                        _context5.n = 9;
                        break;
                      }
                      _err3 = new Error('⚠️ Demasiadas solicitudes. Intenta nuevamente en unos momentos.');
                      _err3.errorCode = 'RATE_LIMIT';
                      throw _err3;
                    case 9:
                      err = new Error(reserveMessage);
                      err.errorCode = reserveResult.errorCode || 'RESERVE_FAILED';
                      throw err;
                    case 10:
                      reservedInstallationId = reserveResult.installationId || null;
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '⏳ Instalando EA en MetaTrader...'));
                      });

                      // ✅ VALIDACIÓN 7: Instalar EA (todas las validaciones pasaron)
                      _context5.n = 11;
                      return window.electronAPI.installEA(terminalId, {
                        userEmail: userEmail
                      });
                    case 11:
                      result = _context5.v;
                      if (!result.success) {
                        _context5.n = 12;
                        break;
                      }
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '✅ EA instalado correctamente\n\nEl MetaTrader completará el registro automáticamente'));
                      });

                      // Limpiar estado después de 3 segundos
                      setTimeout(function () {
                        setStatus(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, ''));
                        });
                        setInstalling(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, false));
                        });
                        handleScan();
                        // Restaurar focus en el input
                        setTimeout(function () {
                          var _emailInputRef$curren;
                          emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren = emailInputRef.current) === null || _emailInputRef$curren === void 0 || _emailInputRef$curren.focus();
                        }, 200);
                      }, 3000);
                      _context5.n = 17;
                      break;
                    case 12:
                      if (!reservedInstallationId) {
                        _context5.n = 16;
                        break;
                      }
                      _context5.p = 13;
                      _context5.n = 14;
                      return window.electronAPI.unreserveInstallation(reservedInstallationId, userEmail, 'INSTALL_FAILED');
                    case 14:
                      _context5.n = 16;
                      break;
                    case 15:
                      _context5.p = 15;
                      _t5 = _context5.v;
                    case 16:
                      errorMsg = result.error || 'Error desconocido';
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, "\u274C Error: ".concat(errorMsg)));
                      });
                      setInstalling(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, false));
                      });

                      // Restaurar focus en caso de error
                      setTimeout(function () {
                        var _emailInputRef$curren2;
                        emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren2 = emailInputRef.current) === null || _emailInputRef$curren2 === void 0 || _emailInputRef$curren2.focus();
                      }, 100);
                    case 17:
                      _context5.n = 23;
                      break;
                    case 18:
                      _context5.p = 18;
                      _t6 = _context5.v;
                      if (!reservedInstallationId) {
                        _context5.n = 22;
                        break;
                      }
                      _context5.p = 19;
                      _context5.n = 20;
                      return window.electronAPI.unreserveInstallation(reservedInstallationId, userEmail, 'INSTALL_EXCEPTION');
                    case 20:
                      _context5.n = 22;
                      break;
                    case 21:
                      _context5.p = 21;
                      _t7 = _context5.v;
                    case 22:
                      _errorMsg = _t6.message || 'Error desconocido';
                      errorCode = _t6.errorCode || 'UNKNOWN'; // Mostrar mensajes de error específicos según el código
                      displayMsg = _errorMsg;
                      if (errorCode === 'EMAIL_NOT_FOUND') {
                        displayMsg = '❌ Debes registrarte con este mail en la plataforma.\n\nEstado: No disponible.';
                      } else if (errorCode === 'USER_NOT_AUTHORIZED') {
                        displayMsg = '❌ Cuenta no autorizada\n\n' + _errorMsg;
                      } else if (errorCode === 'SERVER_ERROR') {
                        displayMsg = '⚠️ El servidor no está disponible\n\n' + _errorMsg;
                      } else if (errorCode === 'UNAUTHORIZED') {
                        displayMsg = '❌ Error de configuración\n\nContacta al administrador.';
                      } else if (errorCode === 'RATE_LIMIT') {
                        displayMsg = '⚠️ Demasiadas solicitudes\n\nEspera unos segundos y vuelve a intentar.';
                      } else if (_errorMsg.includes('no existe en BD')) {
                        displayMsg = '❌ Debes registrarte con este mail en la plataforma.\n\nEstado: No disponible.';
                      } else if (_errorMsg.includes('Usuario inactivo')) {
                        displayMsg = '❌ Usuario inactivo\n\nContacta al administrador';
                      } else if (_errorMsg.includes('Suscripción')) {
                        displayMsg = '❌ Suscripción expirada\n\nRenueva tu suscripción para continuar';
                      }
                      setStatus(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, displayMsg));
                      });
                      setInstalling(function (prev) {
                        return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, false));
                      });

                      // Restaurar focus en caso de error
                      setTimeout(function () {
                        var _emailInputRef$curren3;
                        emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren3 = emailInputRef.current) === null || _emailInputRef$curren3 === void 0 || _emailInputRef$curren3.focus();
                      }, 100);
                    case 23:
                      return _context5.a(2);
                  }
                }, _callee5, null, [[19, 21], [13, 15], [1, 18]]);
              }));
              return function executeInstall() {
                return _ref7.apply(this, arguments);
              };
            }();
            showConfirm({
              title: 'Instalar EA',
              message: "\xBFInstalar EA en ".concat((terminal === null || terminal === void 0 ? void 0 : terminal.name) || 'esta terminal', "?\n\nSe vincular\xE1 al email: ").concat(userEmail),
              confirmLabel: 'Sí, instalar',
              cancelLabel: 'Cancelar',
              onConfirm: executeInstall
            });
          case 5:
            return _context6.a(2);
        }
      }, _callee6);
    }));
    return function handleInstall(_x3) {
      return _ref6.apply(this, arguments);
    };
  }();
  var handleUninstall = /*#__PURE__*/function () {
    var _ref8 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(terminalId) {
      return _regenerator().w(function (_context8) {
        while (1) switch (_context8.n) {
          case 0:
            showConfirm({
              title: 'Desinstalar EA',
              message: '¿Desinstalar EA de esta terminal?\n\nEsto eliminará el EA pero podrás reinstalarlo después.',
              confirmLabel: 'Sí, desinstalar',
              cancelLabel: 'Cancelar',
              onConfirm: function () {
                var _onConfirm = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7() {
                  var result, terminalToUnreserve, installationId, errorMsg, _errorMsg2, _t8, _t9;
                  return _regenerator().w(function (_context7) {
                    while (1) switch (_context7.p = _context7.n) {
                      case 0:
                        setConfirmState(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, {
                            open: false
                          });
                        });
                        setUninstalling(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, true));
                        });
                        setStatus(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '⏳ Desinstalando...'));
                        });
                        _context7.p = 1;
                        _context7.n = 2;
                        return window.electronAPI.uninstallEA(terminalId);
                      case 2:
                        result = _context7.v;
                        if (!result.success) {
                          _context7.n = 7;
                          break;
                        }
                        terminalToUnreserve = terminals.find(function (t) {
                          return t.id === terminalId;
                        });
                        installationId = terminalToUnreserve ? "ID_".concat(terminalToUnreserve.type, "_").concat(terminalToUnreserve.id).toUpperCase() : null;
                        if (!(installationId && userEmail)) {
                          _context7.n = 6;
                          break;
                        }
                        _context7.p = 3;
                        _context7.n = 4;
                        return window.electronAPI.unreserveInstallation(installationId, userEmail, 'UNINSTALL');
                      case 4:
                        _context7.n = 6;
                        break;
                      case 5:
                        _context7.p = 5;
                        _t8 = _context7.v;
                      case 6:
                        setStatus(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, '✅ EA desinstalado correctamente'));
                        });
                        // Limpiar estado después de 2 segundos
                        setTimeout(function () {
                          setStatus(function (prev) {
                            return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, ''));
                          });
                          setUninstalling(function (prev) {
                            return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, false));
                          });
                          handleScan();
                          // Asegurar que el focus vuelva al input
                          setTimeout(function () {
                            var _emailInputRef$curren4;
                            emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren4 = emailInputRef.current) === null || _emailInputRef$curren4 === void 0 || _emailInputRef$curren4.focus();
                          }, 200);
                        }, 2000);
                        _context7.n = 8;
                        break;
                      case 7:
                        errorMsg = result.error || 'Error desconocido';
                        setStatus(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, "\u274C Error: ".concat(errorMsg)));
                        });
                        setUninstalling(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, false));
                        });
                        // Restaurar focus en caso de error
                        setTimeout(function () {
                          var _emailInputRef$curren5;
                          emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren5 = emailInputRef.current) === null || _emailInputRef$curren5 === void 0 || _emailInputRef$curren5.focus();
                        }, 100);
                      case 8:
                        _context7.n = 10;
                        break;
                      case 9:
                        _context7.p = 9;
                        _t9 = _context7.v;
                        _errorMsg2 = _t9.message || 'Error desconocido';
                        setStatus(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, "\u274C ".concat(_errorMsg2)));
                        });
                        setUninstalling(function (prev) {
                          return _objectSpread(_objectSpread({}, prev), {}, _defineProperty({}, terminalId, false));
                        });
                        // Restaurar focus en caso de error
                        setTimeout(function () {
                          var _emailInputRef$curren6;
                          emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren6 = emailInputRef.current) === null || _emailInputRef$curren6 === void 0 || _emailInputRef$curren6.focus();
                        }, 100);
                      case 10:
                        return _context7.a(2);
                    }
                  }, _callee7, null, [[3, 5], [1, 9]]);
                }));
                function onConfirm() {
                  return _onConfirm.apply(this, arguments);
                }
                return onConfirm;
              }()
            });
          case 1:
            return _context8.a(2);
        }
      }, _callee8);
    }));
    return function handleUninstall(_x4) {
      return _ref8.apply(this, arguments);
    };
  }();
  var handleInstallManual = /*#__PURE__*/function () {
    var _ref9 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0() {
      var folderResult, folderPath, _t1;
      return _regenerator().w(function (_context0) {
        while (1) switch (_context0.p = _context0.n) {
          case 0:
            if (userEmail) {
              _context0.n = 1;
              break;
            }
            showError('⚠️ Por favor ingresa un email antes de instalar');
            return _context0.a(2);
          case 1:
            if (validateEmailFormat(userEmail)) {
              _context0.n = 2;
              break;
            }
            showError('⚠️ Email inválido\n\nFormato correcto: usuario@ejemplo.com');
            return _context0.a(2);
          case 2:
            if (!installingManual) {
              _context0.n = 3;
              break;
            }
            return _context0.a(2);
          case 3:
            setInstallingManual(true);
            _context0.p = 4;
            _context0.n = 5;
            return window.electronAPI.selectFolder();
          case 5:
            folderResult = _context0.v;
            if (folderResult.filePath) {
              _context0.n = 6;
              break;
            }
            // Usuario canceló
            setInstallingManual(false);
            return _context0.a(2);
          case 6:
            folderPath = folderResult.filePath;
            showConfirm({
              title: 'Instalación manual',
              message: "\xBFInstalar el EA en esta carpeta?\n\n".concat(folderPath, "\n\nEmail: ").concat(userEmail),
              confirmLabel: 'Sí, instalar',
              cancelLabel: 'Cancelar',
              onConfirm: function () {
                var _onConfirm2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9() {
                  var emailValidation, result, _t0;
                  return _regenerator().w(function (_context9) {
                    while (1) switch (_context9.p = _context9.n) {
                      case 0:
                        _context9.p = 0;
                        _context9.n = 1;
                        return window.electronAPI.registerOrValidateEmail(userEmail);
                      case 1:
                        emailValidation = _context9.v;
                        if (emailValidation.success) {
                          _context9.n = 2;
                          break;
                        }
                        showError("\u274C ".concat(emailValidation.message || 'Email no válido'));
                        setInstallingManual(false);
                        return _context9.a(2);
                      case 2:
                        _context9.n = 3;
                        return window.electronAPI.installEAManual(folderPath, {
                          userEmail: userEmail
                        });
                      case 3:
                        result = _context9.v;
                        if (result.success) {
                          showError("\u2705 EA instalado correctamente\n\nCarpeta: ".concat(folderPath));
                          handleScan();
                        } else {
                          showError("\u274C Error: ".concat(result.error || 'Error desconocido'));
                        }
                        _context9.n = 5;
                        break;
                      case 4:
                        _context9.p = 4;
                        _t0 = _context9.v;
                        showError("\u274C Error: ".concat(_t0.message || 'Error desconocido'));
                      case 5:
                        _context9.p = 5;
                        setInstallingManual(false);
                        setTimeout(function () {
                          var _emailInputRef$curren7;
                          emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren7 = emailInputRef.current) === null || _emailInputRef$curren7 === void 0 || _emailInputRef$curren7.focus();
                        }, 100);
                        return _context9.f(5);
                      case 6:
                        return _context9.a(2);
                    }
                  }, _callee9, null, [[0, 4, 5, 6]]);
                }));
                function onConfirm() {
                  return _onConfirm2.apply(this, arguments);
                }
                return onConfirm;
              }()
            });
            _context0.n = 8;
            break;
          case 7:
            _context0.p = 7;
            _t1 = _context0.v;
            showError("\u274C Error: ".concat(_t1.message || 'Error desconocido'));
            setInstallingManual(false);
            setTimeout(function () {
              var _emailInputRef$curren8;
              emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren8 = emailInputRef.current) === null || _emailInputRef$curren8 === void 0 || _emailInputRef$curren8.focus();
            }, 100);
          case 8:
            return _context0.a(2);
        }
      }, _callee0, null, [[4, 7]]);
    }));
    return function handleInstallManual() {
      return _ref9.apply(this, arguments);
    };
  }();
  var copyToClipboard = function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function () {
      showError('✅ Copiado al portapapeles');
    });
  };
  var terminalCardStyle = {
    background: 'linear-gradient(180deg, rgba(15,23,36,0.95) 0%, rgba(11,18,32,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(6px)'
  };
  var terminalHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    gap: '12px'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      backgroundColor: '#0b1220',
      color: '#e0e0e0',
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '1200px',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '40px',
      paddingBottom: '20px',
      borderBottom: '2px solid rgba(14,116,144,0.3)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      color: '#0e7490',
      fontSize: '28px',
      fontWeight: 'bold',
      margin: '0 0 10px 0'
    }
  }, "TFX-Sync"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#90a4ae',
      fontSize: '14px',
      margin: '0'
    }
  }, "Instalador de Expert Advisors para MetaTrader ")), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setShowInfoModal(true);
    },
    style: {
      padding: '10px 16px',
      backgroundColor: 'rgba(100, 150, 255, 0.2)',
      border: '1px solid #6496ff',
      color: '#6496ff',
      borderRadius: '6px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px',
      transition: 'all 0.3s ease'
    },
    onMouseOver: function onMouseOver(e) {
      e.target.style.backgroundColor = 'rgba(100, 150, 255, 0.3)';
    },
    onMouseOut: function onMouseOut(e) {
      e.target.style.backgroundColor = 'rgba(100, 150, 255, 0.2)';
    }
  }, "\u2139\uFE0F Informaci\xF3n")), /*#__PURE__*/React.createElement("div", {
    style: {
      backgroundColor: '#0f1724',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '30px'
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      marginBottom: '10px',
      fontWeight: 'bold',
      color: '#0e7490',
      fontSize: '14px'
    }
  }, "\uD83D\uDCE7 Email registrado en tripulacionfx.com:"), /*#__PURE__*/React.createElement("input", {
    ref: emailInputRef,
    type: "email",
    value: userEmail,
    onChange: function onChange(e) {
      return setUserEmail(e.target.value);
    },
    placeholder: "usuario@dominio.com",
    style: {
      width: '100%',
      padding: '12px',
      backgroundColor: '#0b1220',
      border: userEmail ? validateEmailFormat(userEmail) ? '2px solid #4caf50' : '2px solid #ff6b6b' : '1px solid rgba(255,255,255,0.12)',
      color: '#e0e0e0',
      borderRadius: '4px',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      fontSize: '14px',
      transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      outline: 'none',
      boxShadow: userEmail && validateEmailFormat(userEmail) ? '0 0 10px rgba(76, 175, 80, 0.3)' : userEmail && !validateEmailFormat(userEmail) ? '0 0 10px rgba(255, 107, 107, 0.3)' : 'none'
    },
    onFocus: function onFocus(e) {
      if (!userEmail) {
        e.target.style.borderColor = 'rgba(14,116,144,0.5)';
      }
    },
    onBlur: function onBlur(e) {
      if (userEmail) {
        e.target.style.borderColor = validateEmailFormat(userEmail) ? '#4caf50' : '#ff6b6b';
      } else {
        e.target.style.borderColor = 'rgba(255,255,255,0.12)';
      }
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: '8px',
      minHeight: '40px'
    }
  }, !userEmail && /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#90a4ae',
      fontSize: '12px',
      margin: '0'
    }
  }, "Ingresa un email v\xE1lido para vincular con las terminales"), userEmail && !validateEmailFormat(userEmail) && /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#ff6b6b',
      fontSize: '12px',
      margin: '0',
      fontWeight: 'bold'
    }
  }, "\u274C Email inv\xE1lido", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: 'normal'
    }
  }, "Formato correcto: usuario@dominio.com")), userEmail && validateEmailFormat(userEmail) && /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#4caf50',
      fontSize: '12px',
      margin: '0',
      fontWeight: 'bold'
    }
  }, "\u2705 Email v\xE1lido (se verificar\xE1 en servidor al instalar)", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '11px',
      fontWeight: 'normal'
    }
  }, "La validaci\xF3n final ocurre cuando haces click en \"Instalar EA\"")))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: '30px',
      display: 'flex',
      gap: '15px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handleScan,
    disabled: scanning,
    style: {
      padding: '12px 24px',
      backgroundColor: scanning ? '#555' : '#0e7490',
      color: scanning ? '#ccc' : '#000',
      border: 'none',
      borderRadius: '6px',
      fontWeight: 'bold',
      cursor: scanning ? 'not-allowed' : 'pointer',
      fontSize: '16px',
      transition: 'all 0.3s ease',
      flex: 1,
      minWidth: '200px'
    },
    onMouseOver: function onMouseOver(e) {
      if (!scanning) e.target.style.backgroundColor = '#1aa6c3';
    },
    onMouseOut: function onMouseOut(e) {
      if (!scanning) e.target.style.backgroundColor = '#0e7490';
    }
  }, scanning ? '⏳ Escaneando...' : '🔍 Escanear Terminales'), /*#__PURE__*/React.createElement("button", {
    onClick: handleInstallManual,
    disabled: installingManual || !userEmail || !validateEmailFormat(userEmail),
    style: {
      padding: '12px 24px',
      backgroundColor: installingManual ? '#555' : userEmail && validateEmailFormat(userEmail) ? '#6496ff' : '#444',
      color: installingManual ? '#ccc' : '#fff',
      border: 'none',
      borderRadius: '6px',
      fontWeight: 'bold',
      cursor: installingManual || !userEmail || !validateEmailFormat(userEmail) ? 'not-allowed' : 'pointer',
      fontSize: '16px',
      transition: 'all 0.3s ease',
      flex: 1,
      minWidth: '200px'
    },
    onMouseOver: function onMouseOver(e) {
      if (userEmail && validateEmailFormat(userEmail) && !installingManual) {
        e.target.style.backgroundColor = '#7ba3ff';
      }
    },
    onMouseOut: function onMouseOut(e) {
      if (userEmail && validateEmailFormat(userEmail) && !installingManual) {
        e.target.style.backgroundColor = '#6496ff';
      }
    }
  }, installingManual ? '⏳ Instalando...' : '📁 Instalación Manual')), /*#__PURE__*/React.createElement("div", {
    style: {
      backgroundColor: '#0f1724',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 12px 30px rgba(0,0,0,0.25)'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      color: '#0e7490',
      fontSize: '18px',
      fontWeight: 'bold',
      margin: '0 0 15px 0'
    }
  }, "\uD83D\uDCCA Terminales Detectadas (", terminals.length, ")"), !terminals || terminals.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '40px',
      color: '#90a4ae'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '16px'
    }
  }, "No se encontraron terminales MT4/MT5"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '12px',
      marginTop: '10px'
    }
  }, "Haz clic en \"\uD83D\uDD0D Escanear Terminales\" para buscar"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '12px',
      marginTop: '10px',
      color: '#0e7490',
      fontWeight: 'bold'
    }
  }, "O usa \"\uD83D\uDCC1 Instalaci\xF3n Manual\" para especificar la carpeta manualmente")) : terminals.map(function (terminal) {
    return /*#__PURE__*/React.createElement("div", {
      key: terminal.id,
      style: _objectSpread(_objectSpread({}, terminalCardStyle), {}, {
        border: expandedTerminal === terminal.id ? '1px solid rgba(14,116,144,0.55)' : '1px solid rgba(255,255,255,0.08)',
        background: expandedTerminal === terminal.id ? 'linear-gradient(180deg, rgba(14,116,144,0.12) 0%, rgba(11,18,32,0.98) 100%)' : 'linear-gradient(180deg, rgba(15,23,36,0.95) 0%, rgba(11,18,32,0.98) 100%)'
      }),
      onClick: function onClick() {
        return setExpandedTerminal(expandedTerminal === terminal.id ? null : terminal.id);
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: terminalHeaderStyle
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      style: {
        color: '#0e7490',
        margin: '0 0 5px 0'
      }
    }, terminal.name === 'N/A' ? '⚠️ No detectado' : terminal.name), /*#__PURE__*/React.createElement("p", {
      style: {
        color: '#90a4ae',
        fontSize: '12px',
        fontFamily: 'monospace',
        margin: '0',
        wordBreak: 'break-all'
      }
    }, "\uD83D\uDCC1 ", terminal.dataPath || 'Sin ruta')), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        padding: '4px 8px',
        backgroundColor: terminal.type === 'MT4' ? 'rgba(147, 112, 219, 0.2)' : 'rgba(99, 102, 241, 0.2)',
        color: terminal.type === 'MT4' ? '#b794f6' : '#818cf8',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 'bold'
      }
    }, terminal.type), /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#90a4ae',
        fontSize: '14px'
      }
    }, terminal.installed ? '✅' : '❌'))), expandedTerminal === terminal.id && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: '15px',
        paddingTop: '15px',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginBottom: '15px',
        fontSize: '13px'
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#90a4ae'
      }
    }, "Tipo:"), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: '5px',
        fontWeight: 'bold'
      }
    }, terminal.type)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#90a4ae'
      }
    }, "Cuenta:"), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: '5px',
        fontWeight: 'bold'
      }
    }, terminal.account)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#90a4ae'
      }
    }, "Broker:"), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: '5px',
        fontWeight: 'bold'
      }
    }, terminal.broker)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#90a4ae'
      }
    }, "Servidor:"), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: '5px',
        fontWeight: 'bold'
      }
    }, terminal.server || 'N/A'))), status[terminal.id] && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px',
        backgroundColor: status[terminal.id].includes('❌') ? 'rgba(255, 107, 107, 0.1)' : status[terminal.id].includes('⏳') ? 'rgba(14, 116, 144, 0.1)' : 'rgba(76, 175, 80, 0.1)',
        border: '1px solid ' + (status[terminal.id].includes('❌') ? 'rgba(255, 107, 107, 0.3)' : status[terminal.id].includes('⏳') ? 'rgba(14, 116, 144, 0.3)' : 'rgba(76, 175, 80, 0.3)'),
        borderRadius: '4px',
        marginBottom: '15px',
        fontSize: '12px',
        color: status[terminal.id].includes('❌') ? '#ff6b6b' : status[terminal.id].includes('⏳') ? '#0e7490' : '#4caf50'
      }
    }, status[terminal.id]), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: '10px',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function onClick(e) {
        e.stopPropagation();
        handleOpenFolder(terminal.dataPath);
      },
      disabled: !terminal.dataPath,
      style: {
        padding: '8px 12px',
        backgroundColor: terminal.dataPath ? '#6496ff' : '#444',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: terminal.dataPath ? 'pointer' : 'not-allowed',
        opacity: terminal.dataPath ? 1 : 0.5,
        transition: 'all 0.3s ease'
      },
      onMouseOver: function onMouseOver(e) {
        if (terminal.dataPath) e.target.style.backgroundColor = '#7ba3ff';
      },
      onMouseOut: function onMouseOut(e) {
        if (terminal.dataPath) e.target.style.backgroundColor = '#6496ff';
      }
    }, "\uD83D\uDCC1 Abrir Carpeta"), terminal.installed && !uninstalling[terminal.id] ? /*#__PURE__*/React.createElement("button", {
      onClick: function onClick(e) {
        e.stopPropagation();
        handleUninstall(terminal.id);
      },
      style: {
        padding: '8px 12px',
        backgroundColor: '#ef4444',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
      },
      onMouseOver: function onMouseOver(e) {
        e.target.style.backgroundColor = '#ff6b6b';
      },
      onMouseOut: function onMouseOut(e) {
        e.target.style.backgroundColor = '#ef4444';
      }
    }, "\uD83D\uDDD1\uFE0F Desinstalar EA") : null, !terminal.installed && !installing[terminal.id] ? /*#__PURE__*/React.createElement("button", {
      onClick: function onClick(e) {
        e.stopPropagation();
        handleInstall(terminal.id);
      },
      disabled: !userEmail || !validateEmailFormat(userEmail),
      style: {
        padding: '8px 12px',
        backgroundColor: userEmail && validateEmailFormat(userEmail) ? '#0e7490' : '#555',
        color: userEmail && validateEmailFormat(userEmail) ? '#000' : '#ccc',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: userEmail && validateEmailFormat(userEmail) ? 'pointer' : 'not-allowed',
        transition: 'all 0.3s ease'
      },
      onMouseOver: function onMouseOver(e) {
        if (userEmail && validateEmailFormat(userEmail)) e.target.style.backgroundColor = '#1aa6c3';
      },
      onMouseOut: function onMouseOut(e) {
        if (userEmail && validateEmailFormat(userEmail)) e.target.style.backgroundColor = '#0e7490';
      }
    }, "\u2B06\uFE0F Instalar EA") : null, installing[terminal.id] && /*#__PURE__*/React.createElement("button", {
      disabled: true,
      style: {
        padding: '8px 12px',
        backgroundColor: '#555',
        color: '#ccc',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: 'not-allowed'
      }
    }, "\u23F3 Instalando..."), uninstalling[terminal.id] && /*#__PURE__*/React.createElement("button", {
      disabled: true,
      style: {
        padding: '8px 12px',
        backgroundColor: '#555',
        color: '#ccc',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: 'not-allowed'
      }
    }, "\u23F3 Desinstalando..."))));
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      color: '#90a4ae',
      fontSize: '12px',
      marginTop: '30px',
      marginBottom: '10px'
    }
  }, "\xA9 2025 tripulacionfx.com. Todos los derechos reservados."), confirmState.open && /*#__PURE__*/React.createElement("div", {
    onClick: function onClick() {
      return setConfirmState(function (prev) {
        return _objectSpread(_objectSpread({}, prev), {}, {
          open: false
        });
      });
    },
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-panel",
    onClick: function onClick(e) {
      return e.stopPropagation();
    },
    style: {
      backgroundColor: '#0f1724',
      border: '1px solid rgba(14, 116, 144, 0.45)',
      borderRadius: '12px',
      padding: '26px',
      maxWidth: '520px',
      width: '92%',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '36px',
      height: '36px',
      borderRadius: '10px',
      display: 'grid',
      placeItems: 'center',
      background: 'rgba(14, 116, 144, 0.2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '18px'
    }
  }, "\u2705")), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: '18px',
      color: '#22d3ee'
    }
  }, confirmState.title)), /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#e0e0e0',
      whiteSpace: 'pre-wrap',
      lineHeight: '1.6',
      marginBottom: '20px'
    }
  }, confirmState.message), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '10px'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setConfirmState(function (prev) {
        return _objectSpread(_objectSpread({}, prev), {}, {
          open: false
        });
      });
    },
    style: {
      padding: '10px 16px',
      backgroundColor: '#1f2937',
      color: '#e5e7eb',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      fontWeight: 'bold',
      cursor: 'pointer',
      flex: 1
    }
  }, confirmState.cancelLabel), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      var fn = confirmState.onConfirm;
      setConfirmState(function (prev) {
        return _objectSpread(_objectSpread({}, prev), {}, {
          open: false
        });
      });
      if (fn) fn();
    },
    style: {
      padding: '10px 16px',
      backgroundColor: '#0e7490',
      color: '#0b1220',
      border: 'none',
      borderRadius: '8px',
      fontWeight: 'bold',
      cursor: 'pointer',
      flex: 1
    }
  }, confirmState.confirmLabel)))), showErrorModal && /*#__PURE__*/React.createElement("div", {
    onClick: function onClick() {
      return setShowErrorModal(false);
    },
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-panel",
    onClick: function onClick(e) {
      return e.stopPropagation();
    },
    style: {
      backgroundColor: '#0f1724',
      border: "1px solid ".concat(modalKind === 'success' ? 'rgba(34, 197, 94, 0.35)' : modalKind === 'warning' ? 'rgba(14, 116, 144, 0.45)' : modalKind === 'error' ? 'rgba(255, 107, 107, 0.35)' : 'rgba(148, 163, 184, 0.3)'),
      borderRadius: '12px',
      padding: '26px',
      maxWidth: '520px',
      width: '92%',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '36px',
      height: '36px',
      borderRadius: '10px',
      display: 'grid',
      placeItems: 'center',
      background: modalKind === 'success' ? 'rgba(34, 197, 94, 0.15)' : modalKind === 'warning' ? 'rgba(14, 116, 144, 0.2)' : modalKind === 'error' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(148, 163, 184, 0.18)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '18px'
    }
  }, modalKind === 'success' ? '✅' : modalKind === 'warning' ? '⚠️' : modalKind === 'error' ? '❌' : 'ℹ️')), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: '18px',
      color: modalKind === 'success' ? '#22c55e' : modalKind === 'warning' ? '#22d3ee' : modalKind === 'error' ? '#ff6b6b' : '#e2e8f0'
    }
  }, modalKind === 'success' ? 'Listo' : modalKind === 'warning' ? 'Atención' : modalKind === 'error' ? 'Error' : 'Información')), /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#e0e0e0',
      whiteSpace: 'pre-wrap',
      lineHeight: '1.6',
      marginBottom: '20px'
    }
  }, errorMessage), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      setShowErrorModal(false);
      // Auto-focus en el email input después de cerrar el modal
      setTimeout(function () {
        var _emailInputRef$curren9;
        emailInputRef === null || emailInputRef === void 0 || (_emailInputRef$curren9 = emailInputRef.current) === null || _emailInputRef$curren9 === void 0 || _emailInputRef$curren9.focus();
      }, 300);
    },
    style: {
      padding: '10px 20px',
      backgroundColor: modalKind === 'success' ? '#22c55e' : modalKind === 'warning' ? '#0e7490' : modalKind === 'error' ? '#ff6b6b' : '#64748b',
      color: '#0b1220',
      border: 'none',
      borderRadius: '8px',
      fontWeight: 'bold',
      cursor: 'pointer',
      width: '100%',
      transition: 'all 0.3s ease'
    },
    onMouseOver: function onMouseOver(e) {
      e.target.style.filter = 'brightness(1.05)';
    },
    onMouseOut: function onMouseOut(e) {
      e.target.style.filter = 'brightness(1)';
    }
  }, "Entendido"))), showAdminModal && /*#__PURE__*/React.createElement("div", {
    onClick: function onClick() {
      return setShowAdminModal(false);
    },
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-panel",
    onClick: function onClick(e) {
      return e.stopPropagation();
    },
    style: {
      backgroundColor: '#0f1724',
      border: '1px solid rgba(14, 116, 144, 0.4)',
      borderRadius: '12px',
      padding: '26px',
      maxWidth: '560px',
      width: '92%',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '36px',
      height: '36px',
      borderRadius: '10px',
      display: 'grid',
      placeItems: 'center',
      background: 'rgba(14, 116, 144, 0.2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '18px'
    }
  }, "\uD83D\uDEE1\uFE0F")), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: '18px',
      color: '#22d3ee'
    }
  }, "Permisos recomendados")), /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#e0e0e0',
      lineHeight: '1.6',
      marginBottom: '16px'
    }
  }, "Para evitar errores al instalar el EA, ejecuta TFX-Sync como Administrador."), /*#__PURE__*/React.createElement("div", {
    style: {
      backgroundColor: '#0b1220',
      border: '1px solid rgba(14, 116, 144, 0.35)',
      borderRadius: '8px',
      padding: '12px',
      color: '#90a4ae',
      fontSize: '13px',
      marginBottom: '18px'
    }
  }, "Clic derecho en el acceso directo \u2192 \u201CEjecutar como administrador\u201D."), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setShowAdminModal(false);
    },
    style: {
      padding: '10px 20px',
      backgroundColor: '#0e7490',
      color: '#0b1220',
      border: 'none',
      borderRadius: '8px',
      fontWeight: 'bold',
      cursor: 'pointer',
      width: '100%'
    }
  }, "Entendido"))), showInfoModal && /*#__PURE__*/React.createElement("div", {
    onClick: function onClick() {
      return setShowInfoModal(false);
    },
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      overflowY: 'auto',
      padding: '20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-panel modal-scroll",
    style: {
      background: 'linear-gradient(180deg, rgba(15,23,36,0.98) 0%, rgba(11,18,32,0.98) 100%)',
      border: '1px solid rgba(14, 116, 144, 0.45)',
      borderRadius: '14px',
      padding: '28px',
      maxWidth: '680px',
      width: '100%',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55)',
      maxHeight: '82vh',
      overflowY: 'auto'
    },
    onClick: function onClick(e) {
      return e.stopPropagation();
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '14px',
      alignItems: 'center',
      marginBottom: '18px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '42px',
      height: '42px',
      borderRadius: '12px',
      display: 'grid',
      placeItems: 'center',
      background: 'rgba(14, 116, 144, 0.2)',
      border: '1px solid rgba(14, 116, 144, 0.35)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '20px'
    }
  }, "\uD83D\uDCDA")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      color: '#22d3ee',
      margin: 0,
      fontSize: '22px'
    }
  }, "Gu\xEDa r\xE1pida de instalaci\xF3n"), /*#__PURE__*/React.createElement("p", {
    style: {
      color: '#90a4ae',
      margin: '4px 0 0 0',
      fontSize: '13px'
    }
  }, "Te explicamos el paso a paso y cu\xE1ndo usar la instalaci\xF3n manual."))), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#e0e0e0',
      lineHeight: '1.8'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "Paso 1: Preparar Email"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '15px'
    }
  }, "1\uFE0F\u20E3 Ingresa tu email en el campo \"\uD83D\uDCE7 Email para sincronizar\"", /*#__PURE__*/React.createElement("br", null), "2\uFE0F\u20E3 Aseg\xFArate que sea v\xE1lido (ej: usuario@ejemplo.com)"), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "Paso 2: Escanear Terminales"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '15px'
    }
  }, "1\uFE0F\u20E3 Haz clic en \"\uD83D\uDD0D Escanear Terminales\"", /*#__PURE__*/React.createElement("br", null), "2\uFE0F\u20E3 Espera a que se detecten tus MT4/MT5"), /*#__PURE__*/React.createElement("div", {
    style: {
      backgroundColor: '#0b1220',
      border: '1px solid rgba(14, 116, 144, 0.25)',
      borderRadius: '10px',
      padding: '14px',
      margin: '10px 0 18px 0'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '0',
      marginBottom: '8px'
    }
  }, "Instalaci\xF3n manual (para principiantes)"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '13px',
      color: '#cbd5e1'
    }
  }, "\xDAsala si la app no detecta tu terminal o si instalaste MetaTrader en una carpeta diferente. Al pulsar \"\uD83D\uDCC1 Instalaci\xF3n Manual\", selecciona la carpeta de datos de MetaTrader. Si no sabes cu\xE1l es: abre MetaTrader \u2192 Archivo \u2192 Open Data Folder y elige esa carpeta.")), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "Paso 3: Instalar EA"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '15px'
    }
  }, "1\uFE0F\u20E3 Haz clic en \"\u2B06\uFE0F Instalar EA\" en la terminal deseada", /*#__PURE__*/React.createElement("br", null), "2\uFE0F\u20E3 Espera a que aparezca \"\u2705 EA instalado correctamente\"", /*#__PURE__*/React.createElement("br", null), "3\uFE0F\u20E3 Ve a tu terminal MT4/MT5 y abre un gr\xE1fico"), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "Paso 4: Activar EA en MetaTrader"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '15px'
    }
  }, "1\uFE0F\u20E3 En el gr\xE1fico, ve a Archivo \u2192 Open Data Folder (o presiona Ctrl+Shift+D)", /*#__PURE__*/React.createElement("br", null), "2\uFE0F\u20E3 Navega a: MQL4/Experts (o MQL5/Experts)", /*#__PURE__*/React.createElement("br", null), "3\uFE0F\u20E3 Arrastra el archivo \"DataBridge.ex4\" (o .ex5) al gr\xE1fico", /*#__PURE__*/React.createElement("br", null), "4\uFE0F\u20E3 Haz clic en \"\u2713 OK\" en la ventana que aparece"), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "\u26A0\uFE0F Error: URL No Permitida (4014)"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '10px'
    }
  }, "Si ves este error en el Journal, necesitas agregar la URL a WebRequest:"), /*#__PURE__*/React.createElement("div", {
    style: {
      backgroundColor: '#0b1220',
      border: '1px solid rgba(14, 116, 144, 0.3)',
      borderRadius: '4px',
      padding: '12px',
      marginBottom: '10px',
      fontFamily: 'monospace',
      fontSize: '12px',
      wordBreak: 'break-all',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#90a4ae'
    }
  }, "https://trading-journal-preprod.monkeydfx-trader.workers.dev"), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return copyToClipboard('https://trading-journal-preprod.monkeydfx-trader.workers.dev');
    },
    style: {
      padding: '4px 8px',
      backgroundColor: '#6496ff',
      color: '#fff',
      border: 'none',
      borderRadius: '3px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 'bold',
      marginLeft: '10px',
      whiteSpace: 'nowrap'
    }
  }, "\uD83D\uDCCB Copiar")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: '13px',
      color: '#90a4ae'
    }
  }, "Luego ve a Tools \u2192 Options \u2192 Expert Advisors \u2192 Permitir WebRequest y agrega la URL"), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "\u26A0\uFE0F MT4: No se sincronizan los trades"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '10px'
    }
  }, "Si ves que no se sincronizan los trades de MT4 a tu journal, necesitas ir a la pesta\xF1a de \"Historial de cuentas\", click derecho y pulsa \"Todo el historial\""), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "\u2705 Instalaci\xF3n Completada"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '15px'
    }
  }, "Una vez el EA est\xE9 corriendo en el gr\xE1fico:", /*#__PURE__*/React.createElement("br", null), "\u2022 Ver\xE1s logs en el Journal (pesta\xF1a \"Expertos\")", /*#__PURE__*/React.createElement("br", null), "\u2022 Los trades se sincronizar\xE1n autom\xE1ticamente", /*#__PURE__*/React.createElement("br", null), "\u2022 El EA se reinicia si cierras y abres MetaTrader"), /*#__PURE__*/React.createElement("h3", {
    style: {
      color: '#0e7490',
      marginTop: '20px',
      marginBottom: '10px'
    }
  }, "\u2753 Preguntas Frecuentes"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\xBFPuedo instalar en varias cuentas?"), /*#__PURE__*/React.createElement("br", null), "\u2705 S\xED, repite el proceso en cada cuenta con el MISMO email"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '10px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\xBFSe guardan los trades autom\xE1ticamente?"), /*#__PURE__*/React.createElement("br", null), "\u2705 S\xED, cada 5 minutos o al instante cuando cierras un trade"), /*#__PURE__*/React.createElement("p", {
    style: {
      marginBottom: '20px'
    }
  }, /*#__PURE__*/React.createElement("strong", null, "\xBFQu\xE9 pasa si desinstalo?"), /*#__PURE__*/React.createElement("br", null), "\u2705 Se elimina el EA pero puedes reinstalarlo en cualquier momento")), /*#__PURE__*/React.createElement("button", {
    onClick: function onClick() {
      return setShowInfoModal(false);
    },
    style: {
      padding: '12px 20px',
      backgroundColor: '#0e7490',
      color: '#0b1220',
      border: 'none',
      borderRadius: '8px',
      fontWeight: 'bold',
      cursor: 'pointer',
      width: '100%',
      marginTop: '20px',
      transition: 'all 0.3s ease'
    },
    onMouseOver: function onMouseOver(e) {
      e.target.style.backgroundColor = '#1aa6c3';
    },
    onMouseOut: function onMouseOut(e) {
      e.target.style.backgroundColor = '#0e7490';
    }
  }, "Cerrar"))));
}

// Exponer para que index.jsx pueda acceder
window.App = App;

// También para ES6 modules si es necesario
var _default = exports["default"] = App;