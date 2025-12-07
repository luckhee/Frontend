"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@/contexts/ChatContext";
import ChatRoom from "./ChatRoom";
import apiClient from "@/utils/apiClient";

export default function ChatRoomWithParams() {
  const searchParams = useSearchParams();
  const { rooms, isConnected, currentRoom, selectRoom, refreshChatRooms } =
    useChat();
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);

  // URL 파라미터로 전달된 roomId 처리
  useEffect(() => {
    const roomIdFromUrl = searchParams.get("roomId");

    if (!roomIdFromUrl) return;

    const roomId = Number(roomIdFromUrl);
    if (isNaN(roomId)) {
      console.error("유효하지 않은 roomId:", roomIdFromUrl);
      return;
    }

    // 이미 선택된 방이면 무시
    if (currentRoom?.id === roomId) {
      console.log("이미 선택된 채팅방입니다:", roomId);
      return;
    }

    // 채팅방 목록에서 찾기
    const targetRoom = rooms.find((room) => room.id === roomId);

    if (targetRoom) {
      console.log("URL 파라미터로 채팅방 자동 선택:", targetRoom.name);
      selectRoom(targetRoom);
      return;
    }

    // 채팅방 목록이 아직 로드되지 않았거나, 목록에 없는 경우
    if (isConnected && !isLoadingRoom) {
      console.log(
        `채팅방 ${roomId}을(를) 목록에서 찾을 수 없습니다. 처리 시도...`
      );
      setIsLoadingRoom(true);

      // 먼저 채팅방 목록 새로고침 시도
      refreshChatRooms()
        .then(() => {
          console.log("채팅방 목록 새로고침 완료, 다시 확인...");
          setIsLoadingRoom(false);
          // 새로고침 후 다시 확인 (다음 useEffect 실행에서 처리됨)
        })
        .catch((error) => {
          console.error("채팅방 목록 새로고침 실패, 직접 조회 시도:", error);
          setIsLoadingRoom(false);

          // 목록 새로고침 실패 시 직접 채팅방 조회
          apiClient
            .get(`/api/chat/rooms/${roomId}`)
            .then((response) => {
              const roomData = response.data?.data || response.data;
              if (roomData && roomData.id) {
                const room = {
                  id: roomData.id,
                  name: roomData.name || `채팅방 ${roomData.id}`,
                  participants: roomData.participants || [],
                };
                console.log("직접 조회한 채팅방:", room);
                selectRoom(room);
              } else {
                console.error("채팅방 데이터가 올바르지 않습니다:", roomData);
              }
            })
            .catch((err) => {
              console.error("채팅방 직접 조회 실패:", err);
              alert("채팅방을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.");
            });
        });
    } else if (!isConnected) {
      console.log("WebSocket이 연결되지 않았습니다. 연결 대기 중...");
    }
  }, [
    searchParams,
    rooms,
    isConnected,
    currentRoom,
    selectRoom,
    refreshChatRooms,
    isLoadingRoom,
  ]);

  return <ChatRoom />;
}
