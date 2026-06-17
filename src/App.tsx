import { useEffect, useState } from "react"
import { MainLayout } from "@/components/layout/MainLayout"
import { useConversationStore } from "@/store/conversationStore"

const useStoreHydrated = () => {
  const [isHydrated, setIsHydrated] = useState(() =>
    useConversationStore.persist.hasHydrated(),
  )

  useEffect(() => {
    const unsubscribeHydrate = useConversationStore.persist.onHydrate(() => {
      setIsHydrated(false)
    })
    const unsubscribeFinishHydration = useConversationStore.persist.onFinishHydration(() => {
      setIsHydrated(true)
    })

    setIsHydrated(useConversationStore.persist.hasHydrated())

    return () => {
      unsubscribeHydrate()
      unsubscribeFinishHydration()
    }
  }, [])

  return isHydrated
}

function App() {
  const isHydrated = useStoreHydrated()

  if (!isHydrated) {
    return (
      <div
        className="min-h-screen bg-[linear-gradient(180deg,#0b1220_0%,#111827_45%,#0a0f1a_100%)]"
        aria-hidden="true"
      />
    )
  }

  return <MainLayout />
}

export default App
