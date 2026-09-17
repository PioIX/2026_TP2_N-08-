const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { Server } = require("socket.io");
const { realizarQuery } = require("./modulos/mysql");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const sessionMiddleware = session({
  secret: "supersarasa",
  resave: false,
  saveUninitialized: false,
});
app.use(sessionMiddleware);

const server = app.listen(PORT, () => {
  console.log(`Servidor NodeJS corriendo en http://localhost:${PORT}/`);
});

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

let contador = 0;

io.on("connection", (socket) => {
  const req = socket.request;

  socket.on("joinRoom", (data) => {
    if (req.session.room != undefined && req.session.room.length > 0) {
      socket.leave(req.session.room);
    }
    req.session.room = data.room;
    socket.join(req.session.room);

    io.to(req.session.room).emit("chat-messages", {
      user: req.session.user,
      room: req.session.room,
    });
  });

  socket.on("pingAll", (data) => {
    console.log("PING ALL:", data);
    io.emit("pingAll", { event: "Ping to all", message: data });
  });

  socket.on("sendMessage", (data) => {
    io.to(req.session.room).emit("newMessage", {
      room: req.session.room,
      message: data.message,
    });
  });

  socket.on("eventoPersonalizado", () => {
    contador++;
    socket.emit("respuestaPersonalizada", { contador });
  });

  socket.on("disconnect", () => {
    console.log("Disconnect");
  });
});



// Registro de usuario
app.post("/register", async (req, res) => {
  const { nombre, apellido, email, password, foto } = req.body;

  if (!nombre || !apellido || !email || !password) {
    return res.status(400).send({ message: "Todos los campos son obligatorios" });
  }

  try {
    // Validar si el email ya existe
    const existe = await realizarQuery("SELECT id_usuario FROM Usuarios WHERE email = ?", [email]);
    if (existe.length > 0) {
      return res.status(400).send({ message: "El email ya está registrado" });
    }

    const sql = `
      INSERT INTO Usuarios (nombre, apellido, email, password, fecha_registro, foto) 
      VALUES (?, ?, ?, ?, NOW(), ?)
    `;
    const resultado = await realizarQuery(sql, [
      nombre, 
      apellido, 
      email, 
      password, 
      foto || "default.png"
    ]);

    res.status(201).send({ 
      message: "Usuario registrado correctamente", 
      id_usuario: resultado.insertId 
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

    // Persistir datos en express-session
    req.session.usuario = usuarios[0];

    res.status(200).send({
      message: "Inicio de sesión exitoso",
      usuario: usuarios[0]
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// // Listado de chats de un usuario (incluye foto del contacto o del grupo)
// app.get("/chats/usuario/:id_usuario", async (req, res) => {
//   const { id_usuario } = req.params;
//   try {
//     const sql = `
//       SELECT 
//         c.id_chat,
//         c.es_grupo,
//         c.fecha,
//         IF(c.es_grupo = 1, c.nombre, u_contacto.nombre) AS nombre,
//         IF(c.es_grupo = 1, NULL, u_contacto.apellido) AS apellido,
//         IF(c.es_grupo = 1, c.foto, u_contacto.foto) AS foto
//       FROM UsuariosPorChat uc
//       JOIN Chats c ON uc.id_chat = c.id_chat
//       LEFT JOIN UsuariosPorChat uc2 ON c.id_chat = uc2.id_chat AND uc2.id_usuario != ? AND c.es_grupo = 0
//       LEFT JOIN Usuarios u_contacto ON uc2.id_usuario = u_contacto.id_usuario
//       WHERE uc.id_usuario = ?
//     `;
//     const chats = await realizarQuery(sql, [id_usuario, id_usuario]);
//     res.status(200).send(chats);
//   } catch (error) {
//     res.status(500).send({ error: error.message });
//   }
// });

// Crear chat individual a partir del mail de otro usuario
app.post("/chats/individual", async (req, res) => {
  const { id_usuario_emisor, email_destino } = req.body;

  try {
    const users = await realizarQuery("SELECT id_usuario FROM Usuarios WHERE email = ?", [email_destino]);

    if (!users || users.length === 0) {
      return res.status(404).send({ message: "El usuario destino no existe" });
    }

    const id_usuario_destino = users[0].id_usuario;

    const resultChat = await realizarQuery(
      "INSERT INTO Chats (nombre, fecha, foto, tipo) VALUES (NULL, NOW(), NULL, 0)"
    );
    const id_chat = resultChat.insertId;

    await realizarQuery(
      "INSERT INTO UsuariosPorChat (id_chat, id_usuario) VALUES (?, ?), (?, ?)",
      [id_chat, id_usuario_emisor, id_chat, id_usuario_destino]
    );

    res.status(201).send({ id_chat, message: "Chat creado con éxito" });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// // Crear chat grupal a partir de múltiples mails
// app.post("/chats/grupal", async (req, res) => {
//   const { id_usuario_creador, nombre_grupo, foto_grupo, emails } = req.body;
//   try {
//     const chatSql = `INSERT INTO Chats (nombre, fecha, foto, es_grupo) VALUES (?, NOW(), ?, 1)`;
//     const resultChat = await realizarQuery(chatSql, [nombre_grupo, foto_grupo || "group_default.png"]);
//     const id_chat = resultChat.insertId;

//     await realizarQuery(`INSERT INTO UsuariosPorChat (id_chat, id_usuario) VALUES (?, ?)`, [id_chat, id_usuario_creador]);

//     for (let email of emails) {
//       const users = await realizarQuery(`SELECT id_usuario FROM Usuarios WHERE email = ?`, [email]);
//       if (users.length > 0) {
//         await realizarQuery(`INSERT INTO UsuariosPorChat (id_chat, id_usuario) VALUES (?, ?)`, [id_chat, users[0].id_usuario]);
//       }
//     }

//     res.status(201).send({ id_chat, message: "Chat grupal creado con éxito" });
//   } catch (error) {
//     res.status(500).send({ error: error.message });
//   }
// });

// // Historial de mensajes de un chat
// app.get("/chats/:id_chat/mensajes", async (req, res) => {
//   const { id_chat } = req.params;
//   try {
//     const sql = `
//       SELECT 
//         m.id_mensaje,
//         m.contenido,
//         m.fecha_envio,
//         m.estado,
//         m.id_chat,
//         m.id_usuario,
//         u.nombre,
//         u.apellido,
//         u.foto
//       FROM Mensajes m
//       JOIN Usuarios u ON m.id_usuario = u.id_usuario
//       WHERE m.id_chat = ?
//       ORDER BY m.fecha_envio ASC
//     `;
//     const mensajes = await realizarQuery(sql, [id_chat]);
//     res.status(200).send(mensajes);
//   } catch (error) {
//     res.status(500).send({ error: error.message });
//   }
// });

// // --- SERVIDOR Y SOCKET.IO ---

// const server = app.listen(PORT, () => {
//   console.log(`Servidor NodeJS corriendo en http://localhost:${PORT}/`);
// });

// const io = new Server(server, {
//   cors: {
//     origin: ["http://localhost:3000", "http://localhost:3001"],
//     methods: ["GET", "POST", "PUT", "DELETE"],
//     credentials: true,
//   },
// });

// io.use((socket, next) => {
//   sessionMiddleware(socket.request, {}, next);
// });

// io.on("connection", (socket) => {
//   const req = socket.request;

//   // Unirse a la sala de un chat específico
//   socket.on("join_room", (id_chat) => {
//     socket.join(`chat_${id_chat}`);
//   });

//   // Recibir, persistir y retransmitir mensaje
//   socket.on("send_message", async (data) => {
//     const { id_chat, id_usuario, contenido } = data;
//     try {
//       const sqlInsert = `INSERT INTO Mensajes (contenido, fecha_envio, estado, id_chat, id_usuario) VALUES (?, NOW(), 'enviado', ?, ?)`;
//       const resultInsert = await realizarQuery(sqlInsert, [contenido, id_chat, id_usuario]);

//       const userSql = `SELECT nombre, apellido, foto FROM Usuarios WHERE id_usuario = ?`;
//       const user = await realizarQuery(userSql, [id_usuario]);

//       const payload = {
//         id_mensaje: resultInsert.insertId,
//         id_chat,
//         id_usuario,
//         nombre: user[0]?.nombre,
//         apellido: user[0]?.apellido,
//         foto: user[0]?.foto,
//         contenido,
//         estado: "enviado",
//         fecha_envio: new Date(),
//       };

//       io.to(`chat_${id_chat}`).emit("receive_message", payload);
//     } catch (error) {
//       console.error("Error al procesar el mensaje:", error);
//     }
//   });
// });