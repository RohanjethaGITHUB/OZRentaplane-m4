import Navbar from '@/components/Navbar'
import HeroScrollStage from '@/components/HeroScrollStage'
import HomeContent from '@/components/HomeContent'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroScrollStage>
          <HomeContent />
        </HeroScrollStage>
        <Footer />
      </main>
    </>
  )
}
