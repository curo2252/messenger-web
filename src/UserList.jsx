import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

function UserList({
  currentUser,
  onSelectUser,
  selectedUser,
  onlineUsers,
  unreadCounts,
  setUnreadCounts,
}) {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const selectedUserIdRef = useRef(selectedUser?.id)

  useEffect(() => {
    selectedUserIdRef.current = selectedUser?.id
  }, [selectedUser?.id])

  useEffect(() => {
    const loadUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, background_url')
        .neq('id', currentUser.id)
        .order('username')

      if (error) {
        console.error(
          'Ошибка загрузки пользователей:',
          error
        )
      } else {
        setUsers(data || [])
      }

      setLoading(false)
    }

    loadUsers()

    // =========================================================
    // NEW USERS REALTIME
    // =========================================================

    const profileChannel = supabase
      .channel(`profiles-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const newUser = payload.new

          if (newUser.id === currentUser.id) {
            return
          }

          setUsers((prev) => {
            if (prev.some((user) => user.id === newUser.id)) {
              return prev
            }

            const updatedUsers = [...prev, newUser]

            return updatedUsers.sort((a, b) =>
              a.username.localeCompare(b.username)
            )
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
    }
  }, [currentUser.id])

  // =========================================================
  // NEW MESSAGES / UNREAD COUNTER
  // =========================================================

  useEffect(() => {
    const messageChannel = supabase
      .channel(`unread-messages-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const message = payload.new

          // Нас интересуют только входящие сообщения
          if (message.receiver_id !== currentUser.id) {
            return
          }

          const senderId = message.sender_id

          // Если этот чат сейчас открыт —
          // Chat.jsx сам обработает сообщение.
          if (selectedUserIdRef.current === senderId) {
            return
          }

          setUnreadCounts((prev) => {
            const currentCount = prev[senderId] || 0

            return {
              ...prev,
              [senderId]: Math.min(currentCount + 1, 4),
            }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(messageChannel)
    }
  }, [
    currentUser.id,
    setUnreadCounts,
  ])

  const filteredUsers = users.filter((user) =>
    user.username
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <aside className="sidebar">
      <h2>Чаты</h2>

      <input
        className="user-search"
        type="text"
        placeholder="Найти пользователя..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="users">
        {loading && <p>Загрузка...</p>}

        {!loading && filteredUsers.length === 0 && (
          <p>Пользователи не найдены</p>
        )}

        {filteredUsers.map((user) => {
          const isOnline = onlineUsers?.includes(user.id)
          const unreadCount = unreadCounts?.[user.id] || 0

          return (
            <button
              key={user.id}
              className={`user-item ${
                selectedUser?.id === user.id
                  ? 'selected'
                  : ''
              }`}
              onClick={() => onSelectUser(user)}
            >
              <div className="avatar">
                {user.username[0].toUpperCase()}
              </div>

              <div className="user-info">
                <span>{user.username}</span>

                <small
                  className={isOnline ? 'online' : 'offline'}
                >
                  {isOnline ? 'В сети' : 'Не в сети'}
                </small>
              </div>

              {unreadCount > 0 && (
                <span className="unread-badge">
                  {unreadCount >= 4 ? '4+' : unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export default UserList