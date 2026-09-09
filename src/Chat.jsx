import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import MicIcon from '@mui/icons-material/Mic'

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)

  return `${mins}:${String(secs).padStart(2, '0')}`
}

function VoiceMessageBubble({ src, isMine }) {
  const audioRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const waveformBars = [
    12, 18, 10, 26, 15,
    22, 14, 17, 11, 20,
    18, 28, 12, 16, 24,
    13, 19, 14, 21, 17,
  ]

  const progress =
    duration > 0
      ? (currentTime / duration) * 100
      : 0

  const displayDuration =
    duration > 0
      ? formatTime(duration)
      : '0:00'

  const togglePlayback = async () => {
    const audio = audioRef.current

    if (!audio) {
      return
    }

    if (audio.paused) {
      try {
        await audio.play()
        setIsPlaying(true)
      } catch (error) {
        console.error(
          'Ошибка воспроизведения аудио:',
          error
        )
      }

      return
    }

    audio.pause()
    setIsPlaying(false)
  }

  return (
    <div
      className="voice-message"
      aria-label="Voice message"
    >
      <button
        type="button"
        className={`voice-message-button ${
          isMine ? 'mine' : 'other'
        }`}
        onClick={togglePlayback}
        aria-label={
          isPlaying
            ? 'Пауза'
            : 'Воспроизведение'
        }
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>

      <div
        className="voice-message-wave"
        aria-hidden="true"
      >
        <span
          className="voice-message-progress"
          style={{
            '--voice-progress': `${progress}%`,
          }}
        />

        {waveformBars.map((bar, index) => (
          <span
            key={`${bar}-${index}`}
            className="voice-message-bar"
            style={{
              height: `${bar}px`,
              opacity:
                index / waveformBars.length <
                progress / 100
                  ? 1
                  : 0.42,
              transform: `scaleY(${index / waveformBars.length < progress / 100 ? 1 : 0.9})`,
            }}
          />
        ))}
      </div>

      <div className="voice-message-meta">
        <span>
          {formatTime(currentTime)} / {displayDuration}
        </span>
      </div>

      <audio
        ref={audioRef}
        className="voice-message-audio"
        preload="metadata"
        src={src}
        onLoadedMetadata={(event) => {
          setDuration(event.target.duration || 0)
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.target.currentTime || 0)
        }}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
        }}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  )
}

function Chat({
  currentUser,
  user,
  onlineUsers,
  onBack,
  onStartCall,
}) {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const [recording, setRecording] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const recordingUserIdRef = useRef(null)
  const discardRecordingRef = useRef(false)
  const audioChunksRef = useRef([])

  const userId = user?.id

  useEffect(() => {
    return () => {
      const mediaRecorder = mediaRecorderRef.current

      if (!mediaRecorder) {
        return
      }

      discardRecordingRef.current = true

      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }

      mediaStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop())
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      return
    }

    let cancelled = false

    const loadMessages = async () => {
      setLoading(true)

      const { data: sentMessages, error: sentError } =
        await supabase
          .from('messages')
          .select(
            'id, sender_id, receiver_id, content, audio_url, created_at, status'
          )
          .eq('sender_id', currentUser.id)
          .eq('receiver_id', userId)

      const { data: receivedMessages, error: receivedError } =
        await supabase
          .from('messages')
          .select(
            'id, sender_id, receiver_id, content, audio_url, created_at, status'
          )
          .eq('sender_id', userId)
          .eq('receiver_id', currentUser.id)

      if (sentError || receivedError) {
        console.error(
          'Ошибка загрузки сообщений:',
          sentError || receivedError
        )

        if (!cancelled) {
          setLoading(false)
        }

        return
      }

      const allMessages = [
        ...(sentMessages || []),
        ...(receivedMessages || []),
      ]

      allMessages.sort(
        (a, b) =>
          new Date(a.created_at) - new Date(b.created_at)
      )

      if (!cancelled) {
        setMessages(allMessages)
        setLoading(false)
      }
    }

    const markMessagesAsDelivered = async () => {
      const { data, error } = await supabase
        .from('messages')
        .update({ status: 'delivered' })
        .eq('sender_id', userId)
        .eq('receiver_id', currentUser.id)
        .eq('status', 'sent')
        .select(
          'id, sender_id, receiver_id, content, audio_url, created_at, status'
        )

      if (error) {
        console.error(
          'Ошибка обновления статуса сообщений:',
          error
        )

        return
      }

      if (!cancelled && data && data.length > 0) {
        setMessages((prev) =>
          prev.map((message) => {
            const updatedMessage = data.find(
              (item) => item.id === message.id
            )

            return updatedMessage || message
          })
        )
      }
    }

    const channel = supabase
      .channel(`chat-${currentUser.id}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const message = payload.new

          const isThisChat =
            (message.sender_id === currentUser.id &&
              message.receiver_id === userId) ||
            (message.sender_id === userId &&
              message.receiver_id === currentUser.id)

          if (!isThisChat) {
            return
          }

          setMessages((prev) => {
            if (
              prev.some(
                (item) => item.id === message.id
              )
            ) {
              return prev
            }

            return [...prev, message]
          })

          if (
            message.sender_id === userId &&
            message.receiver_id === currentUser.id &&
            message.status === 'sent'
          ) {
            supabase
              .from('messages')
              .update({ status: 'delivered' })
              .eq('id', message.id)
              .eq('receiver_id', currentUser.id)
              .then(({ error }) => {
                if (error) {
                  console.error(
                    'Ошибка обновления статуса:',
                    error
                  )
                }
              })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updatedMessage = payload.new

          const isThisChat =
            (updatedMessage.sender_id === currentUser.id &&
              updatedMessage.receiver_id === userId) ||
            (updatedMessage.sender_id === userId &&
              updatedMessage.receiver_id === currentUser.id)

          if (!isThisChat) {
            return
          }

          setMessages((prev) =>
            prev.map((message) =>
              message.id === updatedMessage.id
                ? updatedMessage
                : message
            )
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const deletedMessage = payload.old

          setMessages((prev) =>
            prev.filter(
              (message) =>
                message.id !== deletedMessage.id
            )
          )
        }
      )
      .subscribe()

    loadMessages()
    markMessagesAsDelivered()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [currentUser.id, userId])

  useEffect(() => {
    if (!user?.id) {
      return
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages, user?.id])

  const deleteMessage = async (messageId) => {
    const message = messages.find(
      (item) => item.id === messageId
    )

    if (!message || message.sender_id !== currentUser.id) {
      return
    }

    setDeletingMessageId(messageId)

    const { data, error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', currentUser.id)
      .select('id')

    if (error) {
      console.error(
        'Ошибка удаления сообщения:',
        error
      )

      setDeletingMessageId(null)

      return
    }

    if (!data || data.length === 0) {
      console.error(
        'Сообщение не удалено: проверьте RLS policy для DELETE в таблице messages.'
      )

      setDeletingMessageId(null)

      return
    }

    setMessages((prev) =>
      prev.filter(
        (message) => message.id !== messageId
      )
    )

    setDeletingMessageId(null)
  }

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }

    if (!user) {
      return
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        })

      const mediaRecorder = new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      mediaStreamRef.current = stream
      recordingUserIdRef.current = user.id
      discardRecordingRef.current = false
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        setRecording(false)

        mediaStreamRef.current
          ?.getTracks()
          .forEach((track) => track.stop())

        mediaRecorderRef.current = null
        mediaStreamRef.current = null

        const shouldDiscard =
          discardRecordingRef.current ||
          recordingUserIdRef.current !== user.id

        discardRecordingRef.current = false

        if (shouldDiscard) {
          audioChunksRef.current = []
          return
        }

        const audioBlob = new Blob(
          audioChunksRef.current,
          {
            type: 'audio/webm',
          }
        )

        const fileName = `${currentUser.id}/${Date.now()}.webm`

        const { error: uploadError } =
          await supabase.storage
            .from('voice-messages')
            .upload(fileName, audioBlob, {
              contentType: 'audio/webm',
            })

        if (uploadError) {
          console.error(
            'Ошибка загрузки голосового:',
            uploadError
          )
          return
        }

        const {
          data: { publicUrl },
        } = supabase.storage
          .from('voice-messages')
          .getPublicUrl(fileName)

        const { error: messageError } =
          await supabase
            .from('messages')
            .insert({
              sender_id: currentUser.id,
              receiver_id: user.id,
              content: null,
              audio_url: publicUrl,
              status: 'sent',
            })

        if (messageError) {
          console.error(
            'Ошибка отправки голосового:',
            messageError
          )
        }
      }

      mediaRecorder.start()
      setRecording(true)
    } catch (error) {
      console.error(
        'Не удалось получить доступ к микрофону:',
        error
      )
    }
  }

  const sendMessage = async () => {
    const content = newMessage.trim()

    if (!content || !user) {
      return
    }

    setNewMessage('')

    const { error } = await supabase
      .from('messages')
      .insert({
        sender_id: currentUser.id,
        receiver_id: user.id,
        content,
        status: 'sent',
      })

    if (error) {
      console.error(
        'Ошибка отправки сообщения:',
        error
      )

      setNewMessage(content)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!user) {
    return (
       <div className="chat-empty">
        <div className="chat-empty-content">
          <h2>Добро пожаловать</h2>
          <p>Выберите пользователя, чтобы начать общение</p>
        </div>
      </div>
    )
  }

  const isOnline = onlineUsers?.includes(user.id)

  return (
    <section className="chat">
      <div className="chat-header">
        <button
          type="button"
          className="chat-back-button"
          onClick={onBack}
          aria-label="Вернуться к чатам"
        >
          <span aria-hidden="true">←</span>
          <span>Чаты</span>
        </button>

        <div className="avatar">
          {user.username[0].toUpperCase()}
        </div>

        <div className="chat-user-info">
          <h3>{user.username}</h3>

          <small
            className={
              isOnline
                ? 'online'
                : 'offline'
            }
          >
            {isOnline
              ? 'В сети'
              : 'Не в сети'}
          </small>
        </div>

        <button
          type="button"
          className="call-button"
          onClick={onStartCall}
          aria-label="Начать звонок"
          title="Начать звонок"
        >
          🕿
        </button>
      </div>

      <div className="messages">
        {loading && (
          <p className="chat-empty-text">
            Загрузка сообщений...
          </p>
        )}

        {!loading &&
          messages.length === 0 && (
            <p className="chat-empty-text">
              Начните общение
            </p>
          )}

        {messages.map((message) => {
          const isMine =
            message.sender_id ===
            currentUser.id

          return (
            <div
              key={message.id}
              className={`message-row ${
                isMine
                  ? 'message-row-mine'
                  : 'message-row-other'
              }`}
            >
              {isMine && (
                <button
                  type="button"
                  className="delete-message-button"
                  onClick={() =>
                    deleteMessage(message.id)
                  }
                  disabled={deletingMessageId === message.id}
                  aria-label="Удалить сообщение"
                  title="Удалить сообщение"
                >
                  {deletingMessageId === message.id
                    ? '…'
                    : '✕'}
                </button>
              )}

              <div
                className={`message-bubble ${
                  isMine
                    ? 'message-mine'
                    : 'message-other'
                }`}
              >
                {message.audio_url ? (
                  <VoiceMessageBubble
                    src={message.audio_url}
                    isMine={isMine}
                  />
                ) : (
                  <span>
                    {message.content}
                  </span>
                )}

                {isMine && (
                  <span className="message-status">
                    {message.status ===
                    'delivered'
                      ? '◆'
                      : '◇'}
                  </span>
                )}

              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="message-input">
        <input
          type="text"
          placeholder={
            recording
              ? 'Идёт запись...'
              : 'Написать сообщение...'
          }
          value={newMessage}
          onChange={(e) =>
            setNewMessage(e.target.value)
          }
          onKeyDown={handleKeyDown}
          disabled={recording}
        />

        <button
          type="button"
          className={`voice-button ${
            recording
              ? 'recording'
              : ''
          }`}
          onClick={toggleRecording}
          title={
            recording
              ? 'Остановить запись'
              : 'Записать голосовое сообщение'
          }
        >
          {recording ? (
            '⏹'
          ) : (
            <MicIcon />
          )}
        </button>

        <button
          type="button"
          className="send-button"
          onClick={sendMessage}
          disabled={recording}
          aria-label="Отправить сообщение"
        >
          ➤
        </button>
      </div>
    </section>
  )
}

export default Chat