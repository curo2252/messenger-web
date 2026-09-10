import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'
import { supabase } from './lib/supabase'
import UserList from './UserList'
import Chat from './Chat'

const Call = lazy(() => import('./Call'))

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="app">
        <h1>Messenger</h1>
      </div>
    )
  }

  if (session) {
    return <Messenger session={session} />
  }

  return <Auth />
}

function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isRegister, setIsRegister] = useState(true)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuth = async (e) => {
    e.preventDefault()

    setMessage('')
    setLoading(true)

    if (isRegister) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            username: username.trim(),
          })

        if (profileError) {
          setMessage(profileError.message)
          setLoading(false)
          return
        }
      }
    } else {
      const { error } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }
    }

    setLoading(false)
  }

  const switchMode = () => {
    setIsRegister(!isRegister)
    setMessage('')
    setEmail('')
    setPassword('')
    setUsername('')
  }

  return (
    <div className="app">
      <div className="auth-card">
        <h1>Messenger</h1>

        <p className="subtitle">
          {isRegister
            ? 'Создай аккаунт'
            : 'Войди в аккаунт'}
        </p>

        <form onSubmit={handleAuth}>
          {isRegister && (
            <input
              type="text"
              placeholder="Имя пользователя"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              required
              minLength={3}
              maxLength={20}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />

          <input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
            minLength={6}
          />

          <button type="submit" disabled={loading}>
            {loading
              ? 'Загрузка...'
              : isRegister
                ? 'Создать аккаунт'
                : 'Войти'}
          </button>
        </form>

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        <button
          className="switch-button"
          onClick={switchMode}
          type="button"
        >
          {isRegister
            ? 'У меня уже есть аккаунт'
            : 'Создать новый аккаунт'}
        </button>
      </div>
    </div>
  )
}

function Messenger({ session }) {
  const [profile, setProfile] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [unreadCounts, setUnreadCounts] = useState({})
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [callSetupOpen, setCallSetupOpen] = useState(false)
  const [callParticipants, setCallParticipants] = useState([])
  const [availableUsers, setAvailableUsers] = useState([])
  const [callNotice, setCallNotice] = useState('')

  const callChannelRef = useRef(null)
  const activeCallRef = useRef(null)
  const incomingCallRef = useRef(null)
  const profileRef = useRef(profile)
  const callNoticeTimeoutRef = useRef(null)

  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  useEffect(() => {
    incomingCallRef.current = incomingCall
  }, [incomingCall])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const showCallNotice = (text) => {
    setCallNotice(text)

    if (callNoticeTimeoutRef.current) {
      clearTimeout(callNoticeTimeoutRef.current)
    }

    callNoticeTimeoutRef.current = setTimeout(() => {
      setCallNotice('')
    }, 4000)
  }

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', session.user.id)
        .single()

      if (!error) {
        setProfile(data)
      }
    }

    loadProfile()
  }, [session.user.id])

  useEffect(() => {
    const loadUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .neq('id', session.user.id)
        .order('username')

      if (!error) {
        setAvailableUsers(data || [])
      }
    }

    loadUsers()
  }, [session.user.id])

  useEffect(() => {
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: session.user.id,
        },
      },
    })

    channel.on(
      'presence',
      { event: 'sync' },
      () => {
        const state = channel.presenceState()
        const users = Object.keys(state)

        setOnlineUsers(users)
      }
    )

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session.user.id])

  useEffect(() => {
    const channel = supabase.channel('call-invites')

    callChannelRef.current = channel

    const sendResponse = (
      roomName,
      toUserId,
      type
    ) => {
      channel.send({
        type: 'broadcast',
        event: 'call-response',
        payload: {
          roomName,
          toUserId,
          fromUserId: session.user.id,
          fromUserName:
            profileRef.current?.username ||
            session.user.email ||
            'Пользователь',
          type,
        },
      })
    }

    channel.on(
      'broadcast',
      { event: 'call-invite' },
      ({ payload }) => {
        if (
          payload.toUserId !==
          session.user.id
        ) {
          return
        }

        if (
          payload.callerId ===
          session.user.id
        ) {
          return
        }

        if (
          activeCallRef.current ||
          incomingCallRef.current
        ) {
          sendResponse(
            payload.roomName,
            payload.callerId,
            'busy'
          )
          return
        }

        setIncomingCall(payload)
      }
    )

    channel.on(
      'broadcast',
      { event: 'call-response' },
      ({ payload }) => {
        if (
          payload.toUserId !==
          session.user.id
        ) {
          return
        }

        const text =
          payload.type === 'busy'
            ? `${payload.fromUserName} сейчас на другом звонке`
            : payload.type === 'timeout'
              ? `${payload.fromUserName} не ответил(а)`
              : `${payload.fromUserName} отклонил(а) звонок`

        showCallNotice(text)
      }
    )

    channel.on(
      'broadcast',
      { event: 'call-cancel' },
      ({ payload }) => {
        setIncomingCall((current) =>
          current &&
          current.roomName ===
            payload.roomName
            ? null
            : current
        )
      }
    )

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(
          'Канал звонков подключён'
        )
      }
    })

    return () => {
      callChannelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [session.user.id])

  useEffect(() => {
    if (!incomingCall || activeCall) {
      return
    }

    const timer = setTimeout(() => {
      callChannelRef.current?.send({
        type: 'broadcast',
        event: 'call-response',
        payload: {
          roomName:
            incomingCall.roomName,
          toUserId:
            incomingCall.callerId,
          fromUserId:
            session.user.id,
          fromUserName:
            profile?.username ||
            session.user.email ||
            'Пользователь',
          type: 'timeout',
        },
      })

      setIncomingCall(null)
    }, 45000)

    return () => clearTimeout(timer)
  }, [
    incomingCall,
    activeCall,
    session.user.id,
    profile?.username,
  ])

  const openCallSetup = () => {
    if (activeCall) {
      showCallNotice(
        'Вы уже в звонке'
      )
      return
    }

    setCallParticipants(
      selectedUser ? [selectedUser] : []
    )
    setCallSetupOpen(true)
  }

  const closeCallSetup = () => {
    setCallSetupOpen(false)
    setCallParticipants([])
  }

  const toggleCallParticipant = (user) => {
    setCallParticipants((prev) => {
      const exists = prev.some(
        (item) => item.id === user.id
      )

      if (exists) {
        return prev.filter(
          (item) => item.id !== user.id
        )
      }

      if (prev.length >= 9) {
        return prev
      }

      return [...prev, user]
    })
  }

  const startCall = async (
    participants = callParticipants
  ) => {
    if (!participants.length) {
      return
    }

    if (activeCall) {
      return
    }

    const channel =
      callChannelRef.current

    if (!channel) {
      console.error(
        'Канал звонков ещё не подключён'
      )
      return
    }

    const roomName =
      `call-${crypto.randomUUID()}`

    const recipients =
      participants.filter(
        (user) =>
          user.id !== session.user.id
      )

    if (recipients.length === 0) {
      return
    }

    const invitedUserIds = []

    try {
      for (const user of recipients) {
        const call = {
          roomName,
          callerId:
            session.user.id,
          callerName:
            profile?.username ||
            session.user.email ||
            'Пользователь',
          toUserId: user.id,
        }

        await channel.send({
          type: 'broadcast',
          event: 'call-invite',
          payload: call,
        })

        invitedUserIds.push(user.id)
      }

      setCallSetupOpen(false)
      setCallParticipants([])
      setActiveCall({ roomName })
    } catch (error) {
      console.error(
        'Ошибка отправки приглашения:',
        error
      )

      if (invitedUserIds.length > 0) {
        channel.send({
          type: 'broadcast',
          event: 'call-cancel',
          payload: {
            roomName,
          },
        })
      }

      showCallNotice(
        'Не удалось начать звонок. Попробуйте снова.'
      )
    }
  }

  const acceptCall = () => {
    if (!incomingCall) {
      return
    }

    if (activeCall) {
      return
    }

    setActiveCall({
      roomName:
        incomingCall.roomName,
    })

    setIncomingCall(null)
  }

  const declineCall = () => {
    if (!incomingCall) {
      return
    }

    callChannelRef.current?.send({
      type: 'broadcast',
      event: 'call-response',
      payload: {
        roomName:
          incomingCall.roomName,
        toUserId:
          incomingCall.callerId,
        fromUserId:
          session.user.id,
        fromUserName:
          profile?.username ||
          session.user.email ||
          'Пользователь',
        type: 'decline',
      },
    })

    setIncomingCall(null)
  }

  const leaveCall = () => {
    if (activeCall) {
      callChannelRef.current?.send({
        type: 'broadcast',
        event: 'call-cancel',
        payload: {
          roomName:
            activeCall.roomName,
        },
      })
    }

    setActiveCall(null)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="messenger">
      <header className="messenger-header">
        <h1>Messenger</h1>

        <div className="user-info">
          <button
            className="profile-trigger"
            onClick={() =>
              setShowProfile(true)
            }
          >
            <div className="profile-trigger-avatar">
              {(
                profile?.username ||
                session.user.email
              )[0].toUpperCase()}
            </div>

            <span>
              {profile?.username ||
                session.user.email}
            </span>
          </button>

          <button
            onClick={handleLogout}
          >
            Выйти
          </button>
        </div>
      </header>

      <main
        className={`messenger-main ${
          selectedUser
            ? 'has-selected-chat'
            : ''
        }`}
      >
        <UserList
          currentUser={session.user}
          selectedUser={selectedUser}
          onSelectUser={(user) => {
            setSelectedUser(user)

            setUnreadCounts((prev) => ({
              ...prev,
              [user.id]: 0,
            }))
          }}
          onlineUsers={onlineUsers}
          unreadCounts={unreadCounts}
          setUnreadCounts={
            setUnreadCounts
          }
        />

        <Chat
          currentUser={session.user}
          user={selectedUser}
          onlineUsers={onlineUsers}
          onBack={() =>
            setSelectedUser(null)
          }
          onStartCall={openCallSetup}
          callActive={!!activeCall}
        />
      </main>

      {showProfile && (
        <ProfileModal
          session={session}
          profile={profile}
          setProfile={setProfile}
          onClose={() =>
            setShowProfile(false)
          }
        />
      )}

      {callNotice && (
        <div className="call-notice-toast">
          {callNotice}
        </div>
      )}

      {incomingCall &&
        !activeCall && (
          <div className="incoming-call-overlay">
            <div className="incoming-call-card">
              <div className="incoming-call-avatar">
                {(
                  incomingCall.callerName ||
                  'П'
                )[0].toUpperCase()}
              </div>

              <div className="incoming-call-title">
                Входящий звонок
              </div>

              <div className="incoming-call-name">
                {incomingCall.callerName ||
                  'Пользователь'}
              </div>

              <div className="incoming-call-actions">
                <button
                  className="incoming-call-decline"
                  onClick={
                    declineCall
                  }
                >
                  Отклонить
                </button>

                <button
                  className="incoming-call-accept"
                  onClick={
                    acceptCall
                  }
                >
                  Принять
                </button>
              </div>
            </div>
          </div>
        )}

      {callSetupOpen && (
        <div className="call-setup-overlay">
          <div className="call-setup-card">
            <div className="call-setup-header">
              <div>
                <div className="call-setup-title">
                  Добавить участников
                </div>

                <div className="call-setup-caption">
                  {callParticipants.length + 1}{' '}
                  {callParticipants.length === 0
                    ? 'участник'
                    : callParticipants.length < 9
                      ? 'участника'
                      : 'участников'}
                </div>
              </div>

              <button
                className="call-setup-close"
                onClick={closeCallSetup}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="call-setup-list">
              {availableUsers.map((user) => {
                const selected =
                  callParticipants.some(
                    (item) =>
                      item.id === user.id
                  )

                return (
                  <button
                    key={user.id}
                    type="button"
                    className={`call-setup-item ${
                      selected
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() =>
                      toggleCallParticipant(
                        user
                      )
                    }
                  >
                    <div className="call-setup-avatar">
                      {user.username[0]?.toUpperCase() ||
                        '?'}
                    </div>

                    <div className="call-setup-user">
                      <div className="call-setup-name">
                        {user.username}
                      </div>

                      <div className="call-setup-meta">
                        {selected
                          ? 'Добавлен'
                          : 'Добавить'}
                      </div>
                    </div>

                    <div className="call-setup-check">
                      {selected ? '✓' : '+'}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="call-setup-actions">
              <button
                className="call-setup-cancel"
                onClick={closeCallSetup}
              >
                Отмена
              </button>

              <button
                className="call-setup-confirm"
                onClick={() =>
                  startCall(
                    callParticipants
                  )
                }
                disabled={
                  callParticipants.length ===
                  0
                }
              >
                Начать звонок
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <Suspense
          fallback={
            <div className="call-overlay">
              <div className="call-loading">
                Подключение к звонку...
              </div>
            </div>
          }
        >
          <Call
            currentUser={session.user}
            profile={profile}
            roomName={
              activeCall.roomName
            }
            onLeave={leaveCall}
          />
        </Suspense>
      )}
    </div>
  )
}

function ProfileModal({
  session,
  profile,
  setProfile,
  onClose,
}) {
  const [editing, setEditing] =
    useState(false)

  const [username, setUsername] =
    useState(
      profile?.username || ''
    )

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const registrationDate =
    new Date(
      session.user.created_at
    ).toLocaleDateString(
      'ru-RU',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
    )

  const handleSave = async () => {
    const newUsername =
      username.trim()

    if (!newUsername) {
      setError(
        'Введите имя пользователя'
      )
      return
    }

    if (newUsername.length < 3) {
      setError(
        'Имя должно содержать минимум 3 символа'
      )
      return
    }

    if (newUsername.length > 20) {
      setError(
        'Имя должно содержать максимум 20 символов'
      )
      return
    }

    setSaving(true)
    setError('')

    const {
      data,
      error: updateError,
    } = await supabase
      .from('profiles')
      .update({
        username: newUsername,
      })
      .eq('id', session.user.id)
      .select(
        'username, avatar_url'
      )
      .single()

    if (updateError) {
      if (
        updateError.code ===
        '23505'
      ) {
        setError(
          'Это имя пользователя уже занято'
        )
      } else {
        setError(
          updateError.message
        )
      }

      setSaving(false)
      return
    }

    setProfile(data)
    setUsername(data.username)
    setEditing(false)
    setSaving(false)
  }

  const handleOverlayClick = (e) => {
    if (
      e.target ===
      e.currentTarget
    ) {
      onClose()
    }
  }

  return (
    <div
      className="profile-overlay"
      onClick={
        handleOverlayClick
      }
    >
      <div className="profile-modal">
        <button
          className="profile-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="profile-avatar-large">
          {(
            profile?.username ||
            session.user.email
          )[0].toUpperCase()}
        </div>

        <div className="profile-main-name">
          {profile?.username ||
            session.user.email}
        </div>

        <div className="profile-status">
          Личный профиль
        </div>

        <div className="profile-details">
          <div className="profile-detail">
            <span className="profile-detail-label">
              Имя пользователя
            </span>

            {editing ? (
              <input
                className="profile-edit-input"
                type="text"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value
                  )
                }
                maxLength={20}
                autoFocus
              />
            ) : (
              <span className="profile-detail-value">
                {profile?.username}
              </span>
            )}
          </div>

          <div className="profile-detail">
            <span className="profile-detail-label">
              Email
            </span>

            <span className="profile-detail-value">
              {session.user.email}
            </span>
          </div>

          <div className="profile-detail">
            <span className="profile-detail-label">
              Аккаунт создан
            </span>

            <span className="profile-detail-value">
              {registrationDate}
            </span>
          </div>
        </div>

        {error && (
          <p className="profile-error">
            {error}
          </p>
        )}

        {!editing ? (
          <button
            className="profile-edit-button"
            onClick={() => {
              setUsername(
                profile?.username ||
                  ''
              )
              setError('')
              setEditing(true)
            }}
          >
            Редактировать профиль
          </button>
        ) : (
          <div className="profile-edit-actions">
            <button
              className="profile-cancel-button"
              onClick={() => {
                setUsername(
                  profile?.username ||
                    ''
                )
                setError('')
                setEditing(false)
              }}
              disabled={saving}
            >
              Отмена
            </button>

            <button
              className="profile-save-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving
                ? 'Сохранение...'
                : 'Сохранить'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App