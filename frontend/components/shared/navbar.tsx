'use client';

import { useState, useEffect } from 'react';
import { motion, useScroll, useSpring, AnimatePresence, Variants } from 'framer-motion';
import Logo from './logo';
import LogoIcon from '@/public/logo.png';
import Link from 'next/link';
import { House, Volume2, VolumeOff, User, ShoppingBag, X } from 'lucide-react';
import useSound from 'use-sound';
import { PiUserCircle } from 'react-icons/pi';
import Image from 'next/image';
import avatar from '@/public/avatar.jpg';
import { useStacks } from "@/hooks/use-stacks";
import { abbreviateAddress } from "@/lib/types/stx-utils";
import AnimationWrapper from "@/animation/animation-wrapper";

const NavBar = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  const { userData, connectWallet, disconnectWallet } = useStacks();

  const [isSoundPlaying, setIsSoundPlaying] = useState(false);
  const [play, { pause }] = useSound('/sound/monopoly-theme.mp3', { volume: 0.5, loop: true });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const toggleSound = () => {
    if (isSoundPlaying) {
      pause();
      setIsSoundPlaying(false);
    } else {
      play();
      setIsSoundPlaying(true);
    }
  };

  const openConnectModal = () => {
    setIsModalOpen(true);
  };

  const handleWalletSelect = async () => {
    setIsModalOpen(false);
    setIsConnecting(true);

    try {
      await connectWallet(); // This now includes polling in the hook for reliable detection
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Auto-close modal when connection succeeds
  useEffect(() => {
    if (userData && isModalOpen) {
      setIsModalOpen(false);
    }
  }, [userData, isModalOpen]);

  const modalVariants: Variants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <>
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 bg-[#0FF0FC] origin-[0%] h-[2px] z-[40]"
        style={{ scaleX }}
      />

      {/* Navbar */}
      <header className="w-full h-[87px] flex items-center justify-between px-4 md:px-8 bg-[linear-gradient(180deg,rgba(1,15,16,0.12)_0%,rgba(8,50,52,0.12)_100%)] backdrop-blur-sm relative z-[50]">
        <Logo className="cursor-pointer md:w-[50px] w-[45px]" image={LogoIcon} href="/" />

        <div className="flex items-center gap-[4px]">
          {/* Conditional buttons when connected */}
          {userData && (
            <>
              <button
                type="button"
                className="w-[133px] h-[40px] hidden border border-[#0E282A] hover:border-[#003B3E] rounded-[12px] md:flex justify-center items-center gap-2 bg-[#011112] text-[#AFBAC0]"
              >
                <PiUserCircle className="w-[16px] h-[16px]" />
                <span className="text-[12px] font-[400] font-dmSans">0 friends online</span>
              </button>

              <Link
                href="/profile"
                className="w-[80px] h-[40px] border border-[#0E282A] hover:border-[#003B3E] rounded-[12px] hidden md:flex justify-center items-center gap-2 bg-[#011112] text-[#00F0FF]"
              >
                <User className="w-[16px] h-[16px]" />
                <span className="text-[12px] font-[400] font-dmSans">Profile</span>
              </Link>

              <Link
                href="/game-shop"
                className="w-[70px] h-[40px] border border-[#0E282A] hover:border-[#003B3E] rounded-[12px] hidden md:flex justify-center items-center gap-2 bg-[#011112] text-[#0FF0FC]"
              >
                <ShoppingBag className="w-[16px] h-[16px]" />
                <span className="text-[12px] font-[400] font-dmSans">Shop</span>
              </Link>

              <Link
                href="/"
                className="w-[40px] h-[40px] border border-[#0E282A] hover:border-[#003B3E] rounded-[12px] hidden md:flex justify-center items-center bg-[#011112] text-white"
              >
                <House className="w-[16px] h-[16px]" />
              </Link>

              <button
                type="button"
                onClick={toggleSound}
                className="w-[40px] h-[40px] border border-[#0E282A] hover:border-[#003B3E] rounded-[12px] hidden md:flex justify-center items-center bg-[#011112] text-white"
              >
                {isSoundPlaying ? <Volume2 className="w-[16px] h-[16px]" /> : <VolumeOff className="w-[16px] h-[16px]" />}
              </button>
            </>
          )}

          {/* Wallet Section */}
          {userData ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-[12px] border border-[#0E282A] bg-[#011112] text-[#00F0FF] font-orbitron">
                <div className="h-6 w-6 rounded-full border border-[#0FF0FC] overflow-hidden">
                  <Image
                    src={avatar}
                    alt="Wallet Avatar"
                    width={200}
                    height={200}
                    className="object-cover w-full h-full"
                  />
                </div>
                <span className="text-[14px]">
                  {abbreviateAddress(userData.addresses.stx[0].address)}
                </span>
              </div>

              <button
                onClick={disconnectWallet}
                className="px-3 py-2 rounded-[12px] bg-[#003B3E] hover:bg-[#005458] text-[#0FF0FC] text-sm font-medium transition"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={openConnectModal}
              disabled={isConnecting}
              className="px-6 py-2 rounded-[12px] bg-[#0FF0FC]/80 hover:bg-[#0FF0FC]/40 disabled:opacity-70 disabled:cursor-not-allowed text-[#0D191B] font-medium transition"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          )}
        </div>
      </header>

      {/* Custom Connect Wallet Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 flex z-[99] items-center justify-center">
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setIsModalOpen(false)}
            />

            <motion.div
              className="relative w-full max-w-md rounded-[12px] bg-[#010F10] p-[32px] border-[#003B3E] border-[1px]"
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="w-full flex items-center justify-between relative mb-8">
                <h2 className="w-full text-[24px] font-[600] text-[#F0F7F7] text-left font-orbitron">
                  Connect Wallet
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <AnimationWrapper variant="slideUp" delay={0.1}>
                  <button
                    onClick={handleWalletSelect}
                    className="w-full py-4 rounded-[12px] font-medium bg-[#0FF0FC]/20 hover:bg-[#0FF0FC]/40 text-[#0FF0FC] border border-[#0FF0FC]/30 transition"
                  >
                    Leather / Xverse (Desktop)
                  </button>
                </AnimationWrapper>

                <AnimationWrapper variant="slideUp" delay={0.2}>
                  <button
                    onClick={handleWalletSelect}
                    className="w-full py-4 rounded-[12px] font-medium bg-[#0FF0FC]/20 hover:bg-[#0FF0FC]/40 text-[#0FF0FC] border border-[#0FF0FC]/30 transition"
                  >
                    Mobile Wallet (QR Code)
                  </button>
                </AnimationWrapper>

                <AnimationWrapper variant="slideUp" delay={0.3}>
                  <button
                    onClick={handleWalletSelect}
                    className="w-full py-4 rounded-[12px] font-medium bg-[#0FF0FC]/80 hover:bg-[#0FF0FC]/60 text-[#0D191B] transition"
                  >
                    Any Stacks Wallet
                  </button>
                </AnimationWrapper>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default NavBar;