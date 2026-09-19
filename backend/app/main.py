        history = (db.query(RoomChatMessage).filter(RoomChatMessage.room_id == room_id).order_by(RoomChatMessage.id.desc()).limit(50).all())
        history.reverse()
        history_payload = [{"type":"room_chat","id":m.id,"room_id":room_id,"user_id":m.user_id,"text":m.text,"created_at":m.created_at.isoformat() if m.created_at else None} for m in history]
    await websocket.accept()
    room_chat_connections.setdefault(room_id, set()).add(websocket)
    room_rtc_users.setdefault(room_id, {})[websocket] = user.id
    await websocket.send_json({"type":"room_history","messages":history_payload})
    await websocket.send_json({"type":"rtc_ready","user_id":str(user.id),"room_id":room_id})
    try:
        while True:
            data = await websocket.receive_json()
            if not websocket_session_active(token):
                room_chat_connections.get(room_id, set()).discard(websocket)