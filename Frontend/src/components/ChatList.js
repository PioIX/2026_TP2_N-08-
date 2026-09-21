// src/components/ChatList.js
"use client"

import ChatItem from "./ChatItem";

export default function ChatList({ chats, onClickChat }) {
  return (
    <div>
      {chats.map((chat) => (
        <ChatItem
          key={chat.id_chat}
          chat={chat}
          onClick={onClickChat}
        />
      ))}
    </div>
  );
}