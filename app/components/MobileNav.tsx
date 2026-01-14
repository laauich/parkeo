"use client";






import Link from "next/link";


import { usePathname } from "next/navigation";


import { useMemo, useState } from "react";





type NavItem = {


  href: string;


  label: string;


};





export default function MobileNav({


  brand = "Parkeo",


  items,


  rightSlot,


}: {


  brand?: string;


  items: NavItem[];


  rightSlot?: React.ReactNode; // ex: bouton login/logout, avatar, etc.


}) {


  const pathname = usePathname();


  const [open, setOpen] = useState(false);





  const activeLabel = useMemo(() => {


    const hit = items.find(


      (x) => pathname === x.href || (x.href !== "/" && pathname?.startsWith(x.href + "/"))


    );


    return hit?.label ?? "";


  }, [items, pathname]);





  return (


    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur">


      <div className="mx-auto max-w-6xl px-4 py-3">


        <div className="flex items-center justify-between gap-3">


          {/* Brand */}


          <Link


            href="/"


            className="font-semibold text-slate-900"


            onClick={() => setOpen(false)}


          >


            {brand}


          </Link>





          {/* Desktop nav */}


          <nav className="hidden md:flex items-center gap-2">


            {items.map((it) => {


              const active =


                pathname === it.href ||


                (it.href !== "/" && pathname?.startsWith(it.href + "/"));





              return (


                <Link


                  key={it.href}


                  href={it.href}


                  className={[


                    "px-3 py-2 rounded-xl text-sm border transition",


                    active


                      ? "bg-slate-900 text-white border-slate-900"


                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",


                  ].join(" ")}


                >


                  {it.label}


                </Link>


              );


            })}


            {rightSlot ? <div className="ml-2">{rightSlot}</div> : null}


          </nav>





          {/* Mobile button */}


          <div className="md:hidden flex items-center gap-2">


            {rightSlot ? <div className="mr-1">{rightSlot}</div> : null}





            <button


              type="button"


              aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}


              aria-expanded={open}


              onClick={() => setOpen((v) => !v)}


              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"


            >


              <span className="mr-2">{activeLabel || "Menu"}</span>


              <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>


            </button>


          </div>


        </div>





        {/* Mobile dropdown */}


        {open ? (


          <div className="md:hidden mt-3 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">


            <div className="p-2 grid gap-1">


              {items.map((it) => {


                const active =


                  pathname === it.href ||


                  (it.href !== "/" && pathname?.startsWith(it.href + "/"));





                return (


                  <Link


                    key={it.href}


                    href={it.href}


                    onClick={() => setOpen(false)} // ✅ fermeture au clic


                    className={[


                      "px-3 py-3 rounded-xl text-sm transition",


                      active


                        ? "bg-slate-900 text-white"


                        : "bg-white text-slate-800 hover:bg-slate-50",


                    ].join(" ")}


                  >


                    {it.label}


                  </Link>


                );


              })}


            </div>
          </div>
        ) : null}
      </div>
    </header>
 );
}