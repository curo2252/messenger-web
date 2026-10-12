import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useParticipants,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
} from '@livekit/components-react'

import {
  ConnectionState,
  TokenSource,
  Track,
} from 'livekit-client'

import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import CallEndIcon from '@mui/icons-material/CallEnd'
import AddIcon from '@mui/icons-material/Add'

import '@livekit/components-styles'


const LIVEKIT_TOKEN_SERVER_ID =
  'messengerweb-142hsz'


/* =========================================================
   VIDEO TILE
   ========================================================= */

function VideoTile({
  participant,
  currentUser,
}) {
  const [videoElement, setVideoElement] =
    useState(null)

  const cameraPublication =
    participant.getTrackPublication(
      Track.Source.Camera
    )

  const cameraTrack =
    cameraPublication?.track || null
    







    
  useEffect(() => {
    if (
      !videoElement ||
      !cameraTrack
    ) {
      return
    }

    try {
      cameraTrack.attach(
        videoElement
      )
    } catch (error) {
      console.error(
        'Ошибка подключения видео:',
        error
      )
    }

    return () => {
      try {
        cameraTrack.detach(
          videoElement
        )
      } catch (error) {
        console.error(
          'Ошибка отключения видео:',
          error
        )
      }
    }
  }, [
    videoElement,
    cameraTrack,
  ])

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

  const hasVideo =
    participant.isCameraEnabled &&
    !!cameraTrack

  return (
    <div
      className={`call-participant call-participant-video ${
        participant.isSpeaking
          ? 'is-speaking'
          : ''
      } ${hasVideo ? '' : 'camera-off'}`}
    >
      {hasVideo ? (
        <video
          ref={setVideoElement}
          className={`call-video ${isLocal ? 'local' : ''}`}
          autoPlay
          playsInline
          muted={isLocal}
        />
      ) : (
        <div className="call-avatar">
          {firstLetter}
        </div>
      )}

      <div className="call-participant-name">
        {isLocal
          ? 'Вы'
          : name}
      </div>

      <div
        className={`call-mic-indicator ${
          participant.isMicrophoneEnabled
            ? ''
            : 'muted'
        }`}
        aria-label={participant.isMicrophoneEnabled ? 'Микрофон включён' : 'Микрофон выключен'}
        title={participant.isMicrophoneEnabled ? 'Микрофон включён' : 'Микрофон выключен'}
      >
        {participant.isMicrophoneEnabled
          ? <MicIcon />
          : <MicOffIcon />}
      </div>
    </div>
  )
}


/* =========================================================
   CALL CONTENT
   ========================================================= */

function CallContent({
  currentUser,
  onLeave,
  callType,
  availableUsers,
  onInviteUser,
}) {
  const participants =
    useParticipants()

  const {
    localParticipant,
  } =
    useLocalParticipant()

  const room =
    useRoomContext()

  const connectionState =
    useConnectionState(room)

  const [callError, setCallError] =
    useState('')

  const [inviteListOpen, setInviteListOpen] =
    useState(false)

  const [invitedUserIds, setInvitedUserIds] =
    useState([])

  const [invitingUserId, setInvitingUserId] =
    useState(null)

  const muted =
    localParticipant
      ? !localParticipant.isMicrophoneEnabled
      : false

  const cameraEnabled =
    localParticipant
      ? localParticipant.isCameraEnabled
      : false

  const participantIds = new Set(
    participants.map((participant) => participant.identity)
  )

  const inviteCapacityReached =
    participants.length + invitedUserIds.length >= 10

  const inviteUser = async (user) => {
    if (
      inviteCapacityReached ||
      participantIds.has(user.id) ||
      invitedUserIds.includes(user.id) ||
      invitingUserId
    ) {
      return
    }

    setInvitingUserId(user.id)

    try {
      const sent = await onInviteUser(user)

      if (sent) {
        setInvitedUserIds((current) => [...current, user.id])
      }
    } finally {
      setInvitingUserId(null)
    }
  }


  /* =======================================================
     MICROPHONE
     ======================================================= */

  const toggleMute =
    async () => {
      if (!localParticipant) {
        return
      }

      const nextMuted =
        !muted

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


  /* =======================================================
     CAMERA
     ======================================================= */

  const toggleCamera =
    async () => {
      if (!localParticipant) {
        return
      }

      try {
        await localParticipant.setCameraEnabled(
          !cameraEnabled
        )

        setCallError('')
      } catch (error) {
        console.error(
          'Ошибка камеры:',
          error
        )

        setCallError(
          'Не удалось изменить состояние камеры'
        )
      }
    }


  /* =======================================================
     CONNECTION STATUS
     ======================================================= */

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


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div
      className={`call-screen ${
        callType === 'video'
          ? 'video-call'
          : 'audio-call'
      }`}
    >

      {/* HEADER */}

      <div className="call-header">
        <div>

          <div className="call-title">
            {callType === 'video'
              ? 'Видеозвонок'
              : 'Звонок'}
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
      </div>


      {/* ERROR */}

      {callError && (
        <div className="call-inline-error">
          {callError}
        </div>
      )}


      {/* PARTICIPANTS */}

      <div
        className={`call-participants ${
          callType === 'video'
            ? 'call-participants-video'
            : ''
        }`}
      >

        {participants.map(
          (participant) => {

            if (
              callType === 'video'
            ) {
              return (
                <VideoTile
                  key={
                    participant.identity
                  }
                  participant={
                    participant
                  }
                  currentUser={
                    currentUser
                  }
                />
              )
            }


            /* =========================
               AUDIO PARTICIPANT
               ========================= */

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

        {participants.length === 0 && (
          <div className="call-waiting">
            <span className="call-waiting-indicator" />
            Ожидание подключения участников...
          </div>
        )}

      </div>


      {/* CONTROLS */}

      <div className="call-controls">

        {/* MICROPHONE */}

        <button
          type="button"
          className={`call-control ${
            muted
              ? 'active'
              : ''
          }`}
          onClick={
            toggleMute
          }
          aria-label={
            muted
              ? 'Включить микрофон'
              : 'Выключить микрофон'
          }
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>


        {/* CAMERA */}

        {callType === 'video' && (
          <button
            type="button"
            className={`call-control ${
              !cameraEnabled
                ? 'active'
                : ''
            }`}
            onClick={
              toggleCamera
            }
            aria-label={
              cameraEnabled
                ? 'Выключить камеру'
                : 'Включить камеру'
            }
          >
            {cameraEnabled
              ? <VideocamIcon />
              : <VideocamOffIcon />}
          </button>
        )}

        <div className="call-invite-control">
          <button
            type="button"
            className="call-control"
            onClick={() => setInviteListOpen((open) => !open)}
            aria-label="Пригласить участников"
            aria-expanded={inviteListOpen}
            aria-controls="call-invite-list"
            title="Пригласить участников"
          >
            <AddIcon />
          </button>

          {inviteListOpen && (
            <div className="call-invite-popover" id="call-invite-list">
              <div className="call-invite-title">Пригласить в звонок</div>
              {availableUsers.length === 0 ? (
                <div className="call-invite-empty">Контактов пока нет</div>
              ) : (
                <div className="call-invite-list">
                  {availableUsers.map((user) => {
                    const alreadyInCall = participantIds.has(user.id)
                    const alreadyInvited = invitedUserIds.includes(user.id)
                    const disabled =
                      alreadyInCall ||
                      alreadyInvited ||
                      inviteCapacityReached ||
                      invitingUserId !== null

                    return (
                      <div className="call-invite-item" key={user.id}>
                        <div className="call-setup-avatar">
                          {user.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="call-invite-name">
                          {user.username || 'Пользователь'}
                        </span>
                        <button
                          type="button"
                          className="call-invite-action"
                          onClick={() => inviteUser(user)}
                          disabled={disabled}
                        >
                          {alreadyInCall
                            ? 'В звонке'
                            : alreadyInvited
                              ? 'Отправлено'
                              : invitingUserId === user.id
                                ? 'Отправка...'
                                : 'Пригласить'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {inviteCapacityReached && (
                <div className="call-invite-limit">
                  Достигнут лимит участников
                </div>
              )}
            </div>
          )}
        </div>


        {/* LEAVE */}

        <button
          type="button"
          className="call-leave"
          onClick={
            onLeave
          }
        >
          <CallEndIcon />
        </button>

      </div>


      {/* AUDIO */}

      <StartAudio label="Включить звук собеседника" />
      <RoomAudioRenderer />

    </div>
  )
}


/* =========================================================
   MAIN CALL COMPONENT
   ========================================================= */

export default function Call({
  currentUser,
  profile,
  availableUsers = [],
  roomName,
  callType = 'audio',
  onLeave,
  onInviteUser,
}) {

  const tokenSource =
    useMemo(
      () =>
        TokenSource.developmentTokenServer(
          LIVEKIT_TOKEN_SERVER_ID
        ),
      []
    )


  const participantName =
    useMemo(
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


  /* =======================================================
     GET LIVEKIT TOKEN
     ======================================================= */

  useEffect(() => {

    let cancelled = false

    const wait =
      (ms) =>
        new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              ms
            )
        )


    const connect =
      async () => {

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

              setRetrying(
                true
              )

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

            setConnection(
              credentials
            )

            return

          } catch (err) {

            console.error(
              `Ошибка подключения к LiveKit (попытка ${attempt}/${maxAttempts}):`,
              err
            )


            if (
              attempt ===
                maxAttempts &&
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


  /* =======================================================
     LIVEKIT ERROR
     ======================================================= */

  const handleLiveKitError =
    (err) => {

      console.error(
        'Ошибка LiveKit:',
        err
      )

      setError(
        'Произошла ошибка соединения'
      )
    }


  /* =======================================================
     DISCONNECTED
     ======================================================= */

  const handleDisconnected =
    (reason) => {

      console.log(
        'LiveKit отключён:',
        reason
      )

      onLeave()
    }


  /* =======================================================
     ERROR SCREEN
     ======================================================= */

  if (error) {

    return (
      <div className="call-overlay">

        <div className="call-error">

          <div className="call-error-title">
            Ошибка звонка
          </div>

          <p>
            {error}
          </p>

          <button
            onClick={
              onLeave
            }
          >
            Закрыть
          </button>

        </div>

      </div>
    )
  }


  /* =======================================================
     LOADING
     ======================================================= */

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


  /* =======================================================
     LIVEKIT ROOM
     ======================================================= */

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

        video={
          callType === 'video'
        }

        onError={
          handleLiveKitError
        }

        onDisconnected={
          handleDisconnected
        }
      >

        <CallContent
          currentUser={
            currentUser
          }

          callType={
            callType
          }

          availableUsers={
            availableUsers
          }

          onInviteUser={
            onInviteUser
          }

          onLeave={
            onLeave
          }
        />

      </LiveKitRoom>

    </div>
  )
}