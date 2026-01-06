// src/hooks/useArrowFocus.js
import { useEffect } from 'react';

export const useArrowFocus = (selector = '.focusable') => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      const key = e.key; // Contoh: "a", "Enter", "ArrowDown"

      // --- 1. DETEKSI APAKAH SEDANG MENGETIK ---
      // Cek apakah elemen yang aktif adalah input teks / textarea
      const isTyping = (activeElement.tagName === 'INPUT' && 
        ['text', 'search', 'password', 'email', 'number', 'tel', 'url'].includes(activeElement.type)) ||
        activeElement.tagName === 'TEXTAREA';

      // --- 2. LOGIKA SHORTCUT HURUF (A-Z, 0-9) ---
      // Shortcut HANYA jalan jika user TIDAK sedang mengetik
      if (!isTyping && key.length === 1 && key.match(/[a-z0-9]/i)) {
        // Cari elemen yang punya atribut data-shortcut sesuai tombol
        const target = document.querySelector(`[data-shortcut="${key.toLowerCase()}"]`);
        
        if (target) {
          e.preventDefault();
          target.focus();
          // Opsional: Jika ingin langsung klik saat ditekan, uncomment baris bawah:
          // target.click(); 
          return;
        }
      }

      // --- 3. LOGIKA ARROW KEY (Sama seperti sebelumnya) ---
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (!arrowKeys.includes(key)) return;

      // Izinkan arrow kiri/kanan jalan normal jika sedang mengetik
      if (isTyping && (key === 'ArrowLeft' || key === 'ArrowRight')) return;

      e.preventDefault();

      const focusableElements = Array.from(document.querySelectorAll(selector));
      if (focusableElements.length === 0) return;

      const currentIndex = focusableElements.indexOf(activeElement);
      let nextIndex = 0;

      if (currentIndex === -1) {
        nextIndex = 0;
      } else {
        if (key === 'ArrowRight' || key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % focusableElements.length;
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
          nextIndex = (currentIndex - 1 + focusableElements.length) % focusableElements.length;
        }
      }

      focusableElements[nextIndex]?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selector]);
};