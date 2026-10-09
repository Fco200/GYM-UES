import { useEffect, useRef, useState } from 'react';

/**
 * ChatBotUES - Asistente virtual del Checador (preguntas predefinidas).
 * Responde rutinas de entrenamiento, horarios, reglamento, registro y uso
 * del checador mediante coincidencia de palabras clave. No requiere backend:
 * todo el conocimiento vive aqui (FAQ estatico).
 */

const HORARIO =
  'El gimnasio abre:\n\n- Lunes a Viernes: 6:00 AM - 8:00 PM\n- Sábado: 7:00 AM - 4:00 PM\n- Domingo: Cerrado\n\nEn el checador puedes verlo con el botón "Horarios".';

const REGLAMENTO =
  'Reglamento del gimnasio:\n\n1. Presentarse con una identificación válida.\n2. Usar el uniforme o ropa deportiva adecuada.\n3. El uso del gimnasio es exclusivo para miembros registrados.\n4. Mantener limpio el área de trabajo.\n5. Evitar el uso de celular en la zona de pesas por seguridad.\n6. El certificado médico vigente es obligatorio.\n\nPuedes leerlo completo con el botón "Reglamento" del checador.';

const COMO_CHECAR =
  'Es muy fácil:\n\n1. Escribe tu clave o código en el campo del checador.\n2. Pulsa "Registrar Entrada" (al llegar) o "Registrar Salida" (al irte).\n3. La pantalla te confirmará tu nombre y la hora.\n\nTu clave se valida contra los miembros registrados: si no estás registrado, avisará para que primero te registres en el gimnasio.';

const REGISTRO =
  'Para registrarte como miembro necesitas acudir con el administrador. El registro usa:\n\n- Alumno: tu expediente o matrícula.\n- Personal UES (trabajadores): tu clave de empleado, unidad académica, área laboral y puesto.\n- Persona exterior: se genera una clave GYM-XXXXXX automática.\n- Nombre completo, carrera o adscripción, género y turno.\n- Certificado médico vigente (obligatorio, puedes adjuntar PDF).\n- Fotografía opcional.\n\nEl administrador realiza el alta desde el portal (Directorio de Personas / Registro).';

const CERTIFICADO =
  'Sí, el certificado médico vigente es obligatorio para usar el gimnasio.\n\nEl administrador puede cargarlo como PDF durante el registro o actualizarlo desde la ficha del alumno. Mientras esté marcado como "Si" podrás checar normalmente.';

const RUT_PIERNA =
  'Rutina de PIERNA (40-50 min):\n\n1. Sentadilla con barra: 4 x 8-12\n2. Prensa de piernas: 3 x 12\n3. Extensión de cuádriceps: 3 x 12\n4. Curl femoral (isquios): 3 x 12\n5. Pantorrilla de pie: 4 x 15\n6. Abdominales: 3 x 15\n\nDescansa 60-90 s entre series.';

const RUT_PECHO =
  'Rutina de PECHO (35-45 min):\n\n1. Press de banca con barra: 4 x 8-12\n2. Press inclinado con mancuernas: 3 x 10\n3. Aperturas en banco: 3 x 12\n4. Fondos en máquina o banco: 3 x 10\n\nTermina con 2 series de lagartijas hasta el fallo. Descansa 60-90 s.';

const RUT_ESPALDA =
  'Rutina de ESPALDA (40-50 min):\n\n1. Jalón al pecho (polea): 4 x 10\n2. Remo con barra: 3 x 10\n3. Remo en máquina o en polea baja: 3 x 12\n4. Peso muerto rumano: 3 x 8\n5. Encogimientos de hombros: 3 x 12\n\nAlterna peso y buen agarre. Descansa 60-90 s.';

const RUT_BRAZOS =
  'Rutina de BRAZOS y HOMBROS (35-45 min):\n\n1. Curl de bíceps con barra: 4 x 10-12\n2. Curl martillo: 3 x 12\n3. Press militar: 4 x 8-12\n4. Elevaciones laterales: 3 x 15\n5. Extensiones de tríceps en polea: 3 x 12\n\nAlterna bíceps / tríceps para optimizar el tiempo.';

const RUT_ABDOMEN =
  'Rutina de ABDOMEN (15-20 min):\n\n1. Plancha frontal: 3 x 30-45 s\n2. Crunch clásico: 3 x 15\n3. Elevación de piernas colgado: 3 x 12\n4. Rueda abdominal: 3 x 10\n5. Bicicleta en el aire: 3 x 20\n\nControla la respiración: exhala al subir.';

const RUT_CARDIO =
  'Rutina de CARDIO (20-40 min):\n\n- Opción 1: cinta a ritmo ligero-subido 25-40 min.\n- Opción 2: bicicleta estática o elíptica 30 min.\n- Opción 3 (HIIT): 20 min con intervalos de 45 s a ritmo alto y 45 s de descanso (repite 10 veces).\n\nSiempre empieza con 5 min de calentamiento y termina estirando.';

const FULL_BODY =
  'RUTINA FULL BODY (45-60 min, ideal principiantes 3x/semana):\n\n1. Sentadilla o prensa: 3 x 10\n2. Press de banca o lagartijas: 3 x 10\n3. Remo con barra o polea: 3 x 10\n4. Press militar: 3 x 10\n5. Curl + extensión de tríceps: 2 x 12 c/u\n6. Plancha: 3 x 30 s\n\nDescansa un día entre sesiones para la recuperación.';

const PREGUNTAS_RAPIDAS = [
  'Horarios',
  'Rutinas',
  'Reglamento',
  'Cómo checar'
];

const INTENTS = [
  {
    id: 'saludo',
    keywords: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'hello', 'hi'],
    respuesta: '¡Hola! 👋 Soy el asistente del Gimnasio UES. Puedo ayudarte con rutinas, horarios, reglamento y cómo usar el checador. ¿Qué necesitas saber?',
    sugerencias: PREGUNTAS_RAPIDAS
  },
  {
    id: 'horarios',
    keywords: ['horario', 'hora', 'abre', 'cierra', 'abierto', 'cerrado', 'abrir', 'cerrar', 'a que hora'],
    respuesta: HORARIO,
    sugerencias: ['Rutinas', 'Reglamento']
  },
  {
    id: 'reglamento',
    keywords: ['reglamento', 'normas', 'reglas', 'prohibido', 'obligatorio', 'uniforme', 'identificacion'],
    respuesta: REGLAMENTO,
    sugerencias: ['Horarios', 'Certificado médico']
  },
  {
    id: 'como_checar',
    keywords: ['checar', 'checador', 'marcar', 'asistencia', 'entrada', 'salida', 'registrar mi', 'reloj'],
    respuesta: COMO_CHECAR,
    sugerencias: ['Registro', 'Horarios']
  },
  {
    id: 'registro',
    keywords: ['registrar', 'registro', 'inscribir', 'inscripcion', 'alta', 'nuevo', 'afiliar', 'miembro'],
    respuesta: REGISTRO,
    sugerencias: ['Cómo checar', 'Certificado médico']
  },
  {
    id: 'certificado',
    keywords: ['certificado', 'medico', 'salud', 'examen medico', 'carta'],
    respuesta: CERTIFICADO,
    sugerencias: ['Registro', 'Horarios']
  },
  {
    id: 'rutina_pierna',
    keywords: ['pierna', 'piernas', 'sentadilla', 'cuadricep', 'femoral', 'isquio'],
    respuesta: RUT_PIERNA,
    sugerencias: ['Rutina pecho', 'Rutina espalda', 'Cardio']
  },
  {
    id: 'rutina_pecho',
    keywords: ['pecho', 'pectoral', 'press banca', 'press de banca', 'lagartijas', 'push up', 'banca'],
    respuesta: RUT_PECHO,
    sugerencias: ['Rutina espalda', 'Rutina brazos', 'Rutina abdomen']
  },
  {
    id: 'rutina_espalda',
    keywords: ['espalda', 'dorsal', 'jalon', 'remo', 'trapecio', 'peso muerto'],
    respuesta: RUT_ESPALDA,
    sugerencias: ['Rutina pecho', 'Rutina pierna', 'Rutina brazos']
  },
  {
    id: 'rutina_brazos',
    keywords: ['brazo', 'brazos', 'biceps', 'triceps', 'hombro', 'hombros', 'militar', 'curl', 'antebrazo'],
    respuesta: RUT_BRAZOS,
    sugerencias: ['Rutina pecho', 'Rutina espalda', 'Rutina abdomen']
  },
  {
    id: 'rutina_abdomen',
    keywords: ['abdomen', 'abdominal', 'abdominales', 'crunch', 'plancha', 'core', 'vientre', 'cintura'],
    respuesta: RUT_ABDOMEN,
    sugerencias: ['Rutina brazos', 'Cardio', 'Full body']
  },
  {
    id: 'rutina_cardio',
    keywords: ['cardio', 'cinta', 'correr', 'bicicleta', 'eliptica', 'hiit', 'quemar', 'aerobico', 'resistencia'],
    respuesta: RUT_CARDIO,
    sugerencias: ['Rutina abdomen', 'Full body', 'Preguntas generales']
  },
  {
    id: 'rutinas',
    keywords: ['rutina', 'rutinas', 'ejercicio', 'ejercicios', 'entrenar', 'entrenamiento', 'plan de entreno', 'trabajar', 'musculo', 'marcar', 'bajar de peso', 'definir'],
    respuesta:
      '¡Claro! Elige el grupo muscular que quieras entrenar:\n\n- Pierna\n- Pecho\n- Espalda\n- Brazos y hombros\n- Abdomen\n- Cardio\n- Full body (principiante)',
    sugerencias: ['Rutina pierna', 'Rutina pecho', 'Rutina espalda', 'Rutina brazos', 'Rutina abdomen', 'Cardio', 'Full body']
  },
  {
    id: 'fullbody',
    keywords: ['full body', 'fullbody', 'cuerpo completo', 'principiante', 'principiantes', 'todos los grupos'],
    respuesta: FULL_BODY,
    sugerencias: ['Rutina pierna', 'Rutina pecho', 'Cardio']
  },
  {
    id: 'costo',
    keywords: ['costo', 'precio', 'cuota', 'mensualidad', 'pago', 'pagar', 'pension', 'tarifa', 'inscripcion costo'],
    respuesta:
      'La información de cuotas y pagos la maneja la administración.\n\nTe recomiendo preguntar en la recepción del gimnasio o bien consulta con el administrador desde el portal. ¿Quieres que te recuerde cómo registrarte?',
    sugerencias: ['Registro', 'Horarios']
  },
  {
    id: 'entrenador',
    keywords: ['entrenador', 'entrenadora', 'coach', 'instructor', 'asesoria', 'peso', 'rutina personalizada', 'medidas'],
    respuesta:
      'Puedes solicitar una asesoría con el instructor/a de turno directamente en el gimnasio. Te recomiendan la rutina según tus objetivos (fuerza, resistencia, definir o bajar de peso).\n\nMientras tanto puedo sugerir una rutina base:',
    sugerencias: ['Rutinas', 'Rutina pierna', 'Rutina pecho']
  },
  {
    id: 'ubicacion',
    keywords: ['ubicacion', 'donde', 'lugar', 'direccion', 'estas', 'encuentras', 'gimnasio donde', 'acceso'],
    respuesta:
      'El gimnasio UES se ubica en las instalaciones del campus universitario, junto al área deportiva. Pasa a recepción y te indicarán el acceso.\n\nRecuerda traer tu clave registrada para checar tu entrada. 😀',
    sugerencias: ['Cómo checar', 'Horarios']
  },
  {
    id: 'certificado_check',
    keywords: ['sin certificado', 'no tengo certificado', 'puedo entrar sin'],
    respuesta:
      'Es obligatorio tener el certificado médico vigente (' + '"Si"' + ' en tu ficha) para poder entrar al gimnasio.\n\nSi aún no lo tienes, pide orientación en recepción para tramitarlo y que el administrador lo actualice en tu registro.',
    sugerencias: ['Certificado médico', 'Registro']
  },
  {
    id: 'gracias',
    keywords: ['gracias', 'perfecto', 'genial', 'excelente', 'super', 'buena info'],
    respuesta:
      '¡De nada! 💪 Estoy aquí para ayudarte mientras entrenas en el Gimnasio UES.\n\nSi necesitas algo más, solo pregunta.',
    sugerencias: ['Horarios', 'Rutinas', 'Reglamento']
  }
];

const FALLBACK =
  'Aún no tengo una respuesta para eso. 😅\n\nPuedo ayudarte con:\n- Horarios\n- Reglamento\n- Rutinas de entrenamiento\n- Cómo registrar tu entrada\n- Registro de miembros\n\nSelecciona una opción o pregunta de otra forma.';

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buscar(texto) {
  const t = normalizar(texto);
  let mejor = null;
  for (const intent of INTENTS) {
    for (const kw of intent.keywords) {
      const k = normalizar(kw);
      if (t.includes(k)) {
        // Coincidencia con mas palabras clave gana
        if (!mejor || k.length > mejor.key) mejor = { id: intent.id, key: k };
      }
    }
  }
  if (!mejor) return null;
  return INTENTS.find((i) => i.id === mejor.id);
}

export default function ChatBotUES({ lateral = false }) {
  const [abierto, setAbierto] = useState(lateral);
  const [mensajes, setMensajes] = useState([
    {
      autor: 'bot',
      texto:
        '¡Hola! 👋 Soy el asistente del Gimnasio UES. ¿En qué te ayudo hoy?',
      sugerencias: PREGUNTAS_RAPIDAS
    }
  ]);
  const [texto, setTexto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const finRef = useRef(null);

  useEffect(() => {
    if (finRef.current) finRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, escribiendo, abierto]);

  const responder = (pregunta) => {
    if (escribiendo) return;
    const limpia = pregunta.trim();
    if (!limpia) return;
    setMensajes((m) => [...m, { autor: 'user', texto: limpia }]);
    setTexto('');
    setEscribiendo(true);
    const intent = buscar(limpia);
    const respuesta = intent ? intent.respuesta : FALLBACK;
    setTimeout(() => {
      setEscribiendo(false);
      setMensajes((m) => [
        ...m,
        {
          autor: 'bot',
          texto: respuesta,
          sugerencias: intent ? intent.sugerencias : PREGUNTAS_RAPIDAS
        }
      ]);
    }, 650);
  };

  const enviar = (e) => {
    e.preventDefault();
    responder(texto);
  };

  return (
    <div className={lateral ? 'chatbot chatbot-lateral' : 'chatbot'}>
      {abierto && (
        <div className="chatbot-caja">
          <div className="chatbot-cabecera">
            <img
              src="img/logo_ues.png"
              alt="Logo UES"
              className="chatbot-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div>
              <strong>Asistente Gimnasio UES</strong>
              <span>Respondo preguntas sobre rutinas y el gimnasio</span>
            </div>
            <button
              type="button"
              className="chatbot-cerrar"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar chat"
            >
              {'\u2715'}
            </button>
          </div>

          <div className="chatbot-mensajes">
            {mensajes.map((m, i) => (
              <div key={i}>
                <div className={`chat-burbuja ${m.autor === 'user' ? 'chat-burbuja-user' : 'chat-burbuja-bot'}`}>
                  {m.texto}
                </div>
                {m.autor === 'bot' && m.sugerencias && m.sugerencias.length > 0 && (
                  <div className="chat-chips">
                    {m.sugerencias.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chat-chip"
                        onClick={() => responder(s)}
                        disabled={escribiendo}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {escribiendo && (
              <div className="chat-burbuja chat-burbuja-bot chat-escribiendo">
                Escribiendo<span>.</span>
                <span>.</span>
                <span>.</span>
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form onSubmit={enviar} className="chatbot-entrada">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe tu pregunta..."
              disabled={escribiendo}
            />
            <button type="submit" disabled={escribiendo || !texto.trim()} aria-label="Enviar">
              {'\u27A4'}
            </button>
          </form>
        </div>
      )}

      {!lateral && (
        <button
          type="button"
          className="chatbot-flotante"
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? 'Cerrar chat' : 'Abrir chat'}
          title="Asistente del gimnasio"
        >
          {abierto ? '\u2715' : '\uD83D\uDCAC'}
        </button>
      )}
    </div>
  );
}