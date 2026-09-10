import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react'

import {
  ConnectionState,
  TokenSource,
} from 'livekit-client'

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

  const room = useRoomContext()

  const connectionState =
    useConnectionState(room)

  const muted = localParticipant
    ? !localParticipant.isMicrophoneEnabled
    : false

  const [callError, setCallError] =
    useState('')

  const toggleMute = async () => {
    if (!localParticipant) {
      return
    }

    const nextMuted = !muted

    try {
      await localParticipant.setMicrophoneEnabled(
        !nextMuted
      )

      setCallError('')
    } catch (error) {
      console.error(
        'Ошибка микрофона:',
        error
      )

      setCallError(
        'Не удалось изменить состояние микрофона'
      )
    }
  }

  const connectionText =
    connectionState ===
    ConnectionState.Connecting
      ? 'Подключение...'
      : connectionState ===
        ConnectionState.Reconnecting
        ? 'Восстановление соединения...'
        : connectionState ===
          ConnectionState.SignalReconnecting
          ? 'Восстановление соединения...'
          : connectionState ===
            ConnectionState.Connected
            ? 'В сети'
            : ''

  return (
    <div className="call-screen">
      <div className="call-header">
        <div>
          <div className="call-title">
            Звонок
          </div>

          <div className="call-count">
            {participants.length}{' '}
            {participants.length === 1
              ? 'участник'
              : participants.length < 5
                ? 'участника'
                : 'участников'}
          </div>

          {connectionText && (
            <div className="call-connection-status">
              {connectionText}
            </div>
          )}
        </div>

        <button
          className="call-close"
          onClick={onLeave}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      {callError && (
        <div className="call-inline-error">
          {callError}
        </div>
      )}

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
                    ? '●●●'
                    : '●'}
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
            ? '🕪×'
            : '🕪'}
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

  const participantName = useMemo(
    () =>
      profile?.username ||
      currentUser.email ||
      'Пользователь',
    [
      profile?.username,
      currentUser.email,
    ]
  )

  const [connection, setConnection] =
    useState(null)

  const [error, setError] =
    useState('')

  const [retrying, setRetrying] =
    useState(false)

  useEffect(() => {
    let cancelled = false

    const wait = (ms) =>
      new Promise((resolve) =>
        setTimeout(resolve, ms)
      )

    const connect = async () => {
      setError('')
      setConnection(null)
      setRetrying(false)

      const maxAttempts = 3

      for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt++
      ) {
        if (cancelled) {
          return
        }

        try {
          if (attempt > 1) {
            setRetrying(true)

            await wait(
              1000 *
                Math.pow(
                  2,
                  attempt - 2
                )
            )
          }

          const credentials =
            await tokenSource.fetch({
              roomName,
              participantIdentity:
                currentUser.id,
              participantName,
            })

          if (cancelled) {
            return
          }

          if (
            !credentials?.participantToken ||
            !credentials?.serverUrl
          ) {
            throw new Error(
              'LiveKit вернул неполные данные подключения'
            )
          }

          setRetrying(false)
          setConnection(credentials)

          return
        } catch (err) {
          console.error(
            `Ошибка подключения к LiveKit (попытка ${attempt}/${maxAttempts}):`,
            err
          )

          if (
            attempt === maxAttempts &&
            !cancelled
          ) {
            setRetrying(false)

            setError(
              'Не удалось подключиться к звонку. Проверьте соединение и попробуйте ещё раз.'
            )
          }
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
    participantName,
  ])

  const handleLiveKitError = (err) => {
    console.error(
      'Ошибка LiveKit:',
      err
    )

    setError(
      'Произошла ошибка соединения'
    )
  }

  const handleDisconnected = (
    reason
  ) => {
    console.log(
      'LiveKit отключён:',
      reason
    )

    onLeave()
  }

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
          {retrying
            ? 'Повторное подключение к звонку...'
            : 'Подключение к звонку...'}
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
        onError={handleLiveKitError}
        onDisconnected={
          handleDisconnected
        }
      >
        <CallContent
          currentUser={currentUser}
          onLeave={onLeave}
        />
      </LiveKitRoom>
    </div>
  )
}