// src/app/contactos/page.js
"use client"

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ChatList from "@/components/ChatList";

export default function ContactosPage() {
  const searchParams = useSearchParams();
  const idUsuario = searchParams.get("id");
  const nombreUsuario = searchParams.get("nombre");

  const router = useRouter();

  const [chats, setChats] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:4000/chats/usuario/${idUsuario}`)
      .then((response) => response.json())
      .then((data) => {
        setChats(data);
      });
  }, [idUsuario]);

  const handleClickChat = (chat) => {
    router.push(`/chat/${chat.id_chat}?id=${idUsuario}&nombre=${nombreUsuario}`);
  };

  return (
    <div>
      <h1>Hola, {nombreUsuario}</h1>
      <ChatList chats={chats} onClickChat={handleClickChat} />
    </div>
  );
}