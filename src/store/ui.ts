import { create } from "zustand";

type UIState = {
  cartOpen: boolean;
  menuOpen: boolean;
  openCart: () => void;
  openMenu: () => void;
  closeAll: () => void;
};

export const useUI = create<UIState>((set) => ({
  cartOpen: false,
  menuOpen: false,
  openCart: () => set({ cartOpen: true, menuOpen: false }),
  openMenu: () => set({ menuOpen: true, cartOpen: false }),
  closeAll: () => set({ cartOpen: false, menuOpen: false }),
}));
