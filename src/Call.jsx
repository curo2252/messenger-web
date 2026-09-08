
import { useEffect, useMemo, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
} from '@livekit/components-react'
import { TokenSource } from 'livekit-client'
import '@livekit/components-styles'

const LIVEKIT_TOKEN_SERVER_ID =
  'messengerweb-142hsz'

function CallContent({
  currentUser,
  onLeave,
}) {
  const participants = useParticipants()
  const { localParticipant } =
    useLocalParticipant()

  const [muted, setMuted] =
    useState(false)

  const toggleMute = async () => {
    const nextMuted = !muted

    try {
      await localParticipant.setMicrophoneEnabled(
        !nextMuted
      )

      setMuted(nextMuted)
    } catch (error) {
      console.error(
        'Ошибка микрофона:',
        error
      )
    }
  }

  return (
    <div className="call-screen">
      <div className="call-header">
        <div>
          <div className="call-title">
            Групповой звонок
          </div>

          <div className="call-count">
            {participants.length}{' '}
            {participants.length === 1
              ? 'участник'
              : participants.length < 5
                ? 'участника'
                : 'участников'}
          </div>
        </div>

        <button
          className="call-close"
          onClick={onLeave}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      <div className="call-participants">
        {participants.map(
          (participant) => {
            const name =
              participant.name ||
              participant.identity ||
              'Пользователь'

            const firstLetter =
              name[0]?.toUpperCase() ||
              '?'

            const isLocal =
              participant.identity ===
              currentUser.id

            return (
              <div
                className={`call-participant ${
                  participant.isSpeaking
                    ? 'is-speaking'
                    : ''
                }`}
                key={
                  participant.identity
                }
              >
                <div className="call-avatar">
                  {firstLetter}
                </div>

                <div className="call-participant-name">
                  {isLocal
                    ? 'Вы'
                    : name}
                </div>

                <div
                  className={`call-mic ${
                    participant.isMicrophoneEnabled
                      ? ''
                      : 'muted'
                  }`}
                >
                  {participant.isMicrophoneEnabled
                    ? '●'
                    : '×'}
                </div>
              </div>
            )
          }
        )}
      </div>

      <div className="call-controls">
        <button
          className={`call-control ${
            muted ? 'active' : ''
          }`}
          onClick={toggleMute}
          aria-label={
            muted
              ? 'Включить микрофон'
              : 'Выключить микрофон'
          }
        >
          {muted
            ? '🔇'
            : '🎙'}
        </button>

        <button
          className="call-leave"
          onClick={onLeave}
        >
          Завершить
        </button>
      </div>

      <RoomAudioRenderer />
    </div>
  )
}

export default function Call({
  currentUser,
  profile,
  roomName,
  onLeave,
}) {
  const tokenSource = useMemo(
    () =>
      TokenSource.developmentTokenServer(
        LIVEKIT_TOKEN_SERVER_ID
      ),
    []
  )

  const [connection, setConnection] =
    useState(null)

  const [error, setError] =
    useState('')

  useEffect(() => {
    let cancelled = false

    const connect = async () => {
      try {
        setError('')
        setConnection(null)

        const credentials =
          await tokenSource.fetch({
            roomName,
            participantIdentity:
              currentUser.id,
            participantName:
              profile?.username ||
              currentUser.email ||
              'Пользователь',
          })

        if (!cancelled) {
          setConnection(credentials)
        }
      } catch (err) {
        console.error(
          'Ошибка подключения к LiveKit:',
          err
        )

        if (!cancelled) {
          setError(
            'Не удалось подключиться к звонку'
          )
        }
      }
    }

    connect()

    return () => {
      cancelled = true
    }
  }, [
    tokenSource,
    roomName,
    currentUser.id,
    currentUser.email,
    profile?.username,
  ])

  if (error) {
    return (
      <div className="call-overlay">
        <div className="call-error">
          <div className="call-error-title">
            Ошибка звонка
          </div>

          <p>{error}</p>

          <button onClick={onLeave}>
            Закрыть
          </button>
        </div>
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="call-overlay">
        <div className="call-loading">
          Подключение к звонку...
        </div>
      </div>
    )
  }

  return (
    <div className="call-overlay">
      <LiveKitRoom
        token={
          connection.participantToken
        }
        serverUrl={
          connection.serverUrl
        }
        connect={true}
        audio={true}
        video={false}
        onDisconnected={onLeave}
      >
        <CallContent
          currentUser={currentUser}
          onLeave={onLeave}
        />
      </LiveKitRoom>
    </div>
  )
}

