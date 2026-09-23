// src/components/ChatItem.js
"use client"

export default function ChatItem({ chat, onClick }) {
  const fotoAMostrar = chat.foto ? chat.foto : "/default.png";

  return (
    <div onClick={() => onClick(chat)}>
      <img src={fotoAMostrar} alt={chat.nombre} width="50" height="50" />
      <p>{chat.nombre}</p>
    </div>
  );
}