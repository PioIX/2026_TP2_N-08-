const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { Server } = require("socket.io");
const { realizarQuery } = require("./modulos/mysql");

const app = express();
const PORT = process.env.PORT || 4000;

// Origenes del/los frontend que van a consumir esta API.
// Si tu frontend corre en otro puerto/host, agregalo acá.
const FRONT_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

app.use(
  cors({
    origin: FRONT_ORIGINS,
    credentials: true, // necesario para que viaje la cookie de sesión
  })
);
app.use(express.json());

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "supersarasa",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // poner en true si el backend se sirve por https
    httpOnly: true,
    sameSite: "lax",
  },
});
app.use(sessionMiddleware);

const server = app.listen(PORT, () => {
  console.log(`Servidor NodeJS corriendo en http://localhost:${PORT}/`);
});

const io = new Server(server, {
  cors: {
    origin: FRONT_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

// Comparte la sesión de express con los sockets: así en cada socket
// tenemos disponible req.session.usuario si el usuario ya hizo login.
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// ------------------------------------------------------------------
// Middleware de autenticación para rutas HTTP
// ------------------------------------------------------------------
function requireAuth(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).send({ message: "No autenticado" });
  }
  next();
}

// ====================================================================
// AUTENTICACIÓN
// ====================================================================

app.post("/register", async (req, res) => {
  const { nombre, apellido, email, password, foto } = req.body;

  if (!nombre || !apellido || !email || !password) {
    return res.status(400).send({ message: "Todos los campos son obligatorios" });
  }

  try {
    const existe = await realizarQuery("SELECT id_usuario FROM Usuarios WHERE email = ?", [email]);
    if (existe.length > 0) {
      return res.status(400).send({ message: "El email ya está registrado" });
    }

    const sql = `
      INSERT INTO Usuarios (nombre, apellido, email, password, fecha_registro, foto) 
      VALUES (?, ?, ?, ?, NOW(), ?)
    `;
    const resultado = await realizarQuery(sql, [nombre, apellido, email, password, foto || "default.png"]);

    res.status(201).send({
      message: "Usuario registrado correctamente",
      id_usuario: resultado.insertId,
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send({ message: "Email y contraseña requeridos" });
  }

  try {
    const sql = `
      SELECT id_usuario, nombre, apellido, email, foto 
      FROM Usuarios 
      WHERE email = ? AND password = ?
    `;
    const usuarios = await realizarQuery(sql, [email, password]);

    if (usuarios.length === 0) {
      return res.status(401).send({ message: "Credenciales inválidas" });
    }

    req.session.usuario = usuarios[0];

    res.status(200).send({
      message: "Inicio de sesión exitoso",
      usuario: usuarios[0],
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(200).send({ message: "Sesión cerrada" });
  });
});

app.get("/me", requireAuth, (req, res) => {
  res.status(200).send({ usuario: req.session.usuario });
});

// ====================================================================
// CHATS
// ====================================================================

// Listado de chats del usuario logueado, con nombre/foto "de portada"
// (la del contacto si es individual, la del grupo si es grupal)
// y el último mensaje, para armar la lista tipo WhatsApp.
app.get("/chats", requireAuth, async (req, res) => {
  const id_usuario = req.session.usuario.id_usuario;

  try {
    const sql = `
      SELECT 
        c.id_chat,
        c.es_grupo,
        c.fecha,
        CASE WHEN c.es_grupo = 1 THEN c.nombre ELSE CONCAT(otro.nombre, ' ', otro.apellido) END AS nombre,
        CASE WHEN c.es_grupo = 1 THEN c.foto ELSE otro.foto END AS foto,
        um.contenido AS ultimo_mensaje,
        um.fecha_envio AS ultimo_mensaje_fecha
      FROM Chats c
      JOIN UsuariosPorChat upc 
        ON upc.id_chat = c.id_chat AND upc.id_usuario = ?
      LEFT JOIN UsuariosPorChat upc_otro 
        ON upc_otro.id_chat = c.id_chat 
        AND upc_otro.id_usuario <> ? 
        AND c.es_grupo = 0
      LEFT JOIN Usuarios otro ON otro.id_usuario = upc_otro.id_usuario
      LEFT JOIN Mensajes um ON um.id_mensaje = (
        SELECT m2.id_mensaje FROM Mensajes m2
        WHERE m2.id_chat = c.id_chat
        ORDER BY m2.fecha_envio DESC
        LIMIT 1
      )
      ORDER BY um.fecha_envio DESC, c.fecha DESC
    `;
    const chats = await realizarQuery(sql, [id_usuario, id_usuario]);
    res.status(200).send(chats);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Crear (o recuperar) un chat individual a partir del mail de otro usuario
app.post("/chats/individual", requireAuth, async (req, res) => {
  const id_usuario = req.session.usuario.id_usuario;
  const { email } = req.body;

  if (!email) {
    return res.status(400).send({ message: "El email es obligatorio" });
  }

  try {
    const otros = await realizarQuery("SELECT id_usuario FROM Usuarios WHERE email = ?", [email]);
    if (otros.length === 0) {
      return res.status(404).send({ message: "No existe un usuario con ese email" });
    }
    const id_otro = otros[0].id_usuario;

    if (id_otro === id_usuario) {
      return res.status(400).send({ message: "No podés crear un chat con vos mismo" });
    }

    // Evita duplicar el chat si ya existe uno individual entre ambos
    const existente = await realizarQuery(
      `
      SELECT c.id_chat FROM Chats c
      JOIN UsuariosPorChat u1 ON u1.id_chat = c.id_chat AND u1.id_usuario = ?
      JOIN UsuariosPorChat u2 ON u2.id_chat = c.id_chat AND u2.id_usuario = ?
      WHERE c.es_grupo = 0
      LIMIT 1
    `,
      [id_usuario, id_otro]
    );

    if (existente.length > 0) {
      return res.status(200).send({ message: "El chat ya existía", id_chat: existente[0].id_chat });
    }

    const nuevoChat = await realizarQuery(
      "INSERT INTO Chats (nombre, fecha, foto, es_grupo) VALUES (NULL, NOW(), NULL, 0)"
    );
    const id_chat = nuevoChat.insertId;

    await realizarQuery("INSERT INTO UsuariosPorChat (id_chat, id_usuario) VALUES (?, ?), (?, ?)", [
      id_chat,
      id_usuario,
      id_chat,
      id_otro,
    ]);

    res.status(201).send({ message: "Chat creado correctamente", id_chat });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Crear un chat grupal a partir de múltiples mails
app.post("/chats/grupal", requireAuth, async (req, res) => {
  const id_usuario = req.session.usuario.id_usuario;
  const { nombre, emails } = req.body;

  if (!nombre || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).send({ message: "Nombre del grupo y al menos un email son obligatorios" });
  }

  try {
    const placeholders = emails.map(() => "?").join(",");
    const usuarios = await realizarQuery(
      `SELECT id_usuario, email FROM Usuarios WHERE email IN (${placeholders})`,
      emails
    );

    if (usuarios.length === 0) {
      return res.status(404).send({ message: "Ninguno de los emails corresponde a un usuario existente" });
    }

    const nuevoChat = await realizarQuery("INSERT INTO Chats (nombre, fecha, foto, es_grupo) VALUES (?, NOW(), NULL, 1)", [
      nombre,
    ]);
    const id_chat = nuevoChat.insertId;

    // El creador del grupo siempre queda incluido
    const idsParticipantes = new Set(usuarios.map((u) => u.id_usuario));
    idsParticipantes.add(id_usuario);

    const valuesPlaceholders = [];
    const values = [];
    idsParticipantes.forEach((id) => {
      valuesPlaceholders.push("(?, ?)");
      values.push(id_chat, id);
    });

    await realizarQuery(
      `INSERT INTO UsuariosPorChat (id_chat, id_usuario) VALUES ${valuesPlaceholders.join(",")}`,
      values
    );

    const emailsEncontrados = usuarios.map((u) => u.email);
    const emailsNoEncontrados = emails.filter((e) => !emailsEncontrados.includes(e));

    res.status(201).send({
      message: "Chat grupal creado correctamente",
      id_chat,
      emails_no_encontrados: emailsNoEncontrados,
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Historial de mensajes de un chat
app.get("/chats/:id_chat/mensajes", requireAuth, async (req, res) => {
  const id_usuario = req.session.usuario.id_usuario;
  const { id_chat } = req.params;

  try {
    const pertenece = await realizarQuery(
      "SELECT id_chat_usuario FROM UsuariosPorChat WHERE id_chat = ? AND id_usuario = ?",
      [id_chat, id_usuario]
    );
    if (pertenece.length === 0) {
      return res.status(403).send({ message: "No pertenecés a este chat" });
    }

    const mensajes = await realizarQuery(
      `
      SELECT 
        m.id_mensaje, m.contenido, m.fecha_envio, m.estado,
        m.id_usuario, u.nombre, u.apellido, u.foto
      FROM Mensajes m
      JOIN Usuarios u ON u.id_usuario = m.id_usuario
      WHERE m.id_chat = ?
      ORDER BY m.fecha_envio ASC
    `,
      [id_chat]
    );

    res.status(200).send(mensajes);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ====================================================================
// SOCKET.IO — mensajería en tiempo real
// ====================================================================
io.on("connection", (socket) => {
  const req = socket.request;
  let salaActual = null; // sala por-conexión, no por-sesión (soporta multiples pestañas)

  // El cliente pide unirse a un chat puntual (al abrirlo en pantalla)
  socket.on("joinChat", async (data) => {
    const usuario = req.session.usuario;
    if (!usuario) {
      return socket.emit("errorChat", { message: "No autenticado" });
    }

    try {
      const pertenece = await realizarQuery(
        "SELECT id_chat_usuario FROM UsuariosPorChat WHERE id_chat = ? AND id_usuario = ?",
        [data.id_chat, usuario.id_usuario]
      );
      if (pertenece.length === 0) {
        return socket.emit("errorChat", { message: "No pertenecés a este chat" });
      }

      if (salaActual) {
        socket.leave(salaActual);
      }
      salaActual = `chat_${data.id_chat}`;
      socket.join(salaActual);

      socket.emit("joinedChat", { id_chat: data.id_chat });
    } catch (error) {
      socket.emit("errorChat", { message: error.message });
    }
  });

  // Envío de un mensaje: se persiste en la base y se emite a todos
  // los participantes conectados a la sala del chat.
  socket.on("sendMessage", async (data) => {
    const usuario = req.session.usuario;
    if (!usuario) {
      return socket.emit("errorChat", { message: "No autenticado" });
    }

    const { id_chat, contenido } = data;
    if (!id_chat || !contenido || !contenido.trim()) {
      return socket.emit("errorChat", { message: "Mensaje inválido" });
    }

    try {
      const resultado = await realizarQuery(
        "INSERT INTO Mensajes (contenido, fecha_envio, estado, id_chat, id_usuario) VALUES (?, NOW(), 0, ?, ?)",
        [contenido, id_chat, usuario.id_usuario]
      );

      const mensaje = {
        id_mensaje: resultado.insertId,
        contenido,
        fecha_envio: new Date(),
        estado: 0,
        id_chat,
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        foto: usuario.foto,
      };

      io.to(`chat_${id_chat}`).emit("newMessage", mensaje);
    } catch (error) {
      socket.emit("errorChat", { message: error.message });
    }
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado");
  });
});
