'use client'

import { useState } from 'react'

interface FaqItem {
  q: string
  a: string
}

interface FaqAccordionProps {
  items: FaqItem[]
}

export default function FaqAccordion({ items }: FaqAccordionProps) {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="faq-list" role="list">
      {items.map((item, i) => (
        <div
          key={i}
          className={`faq-item ${open === i ? 'open' : ''}`}
          role="listitem"
        >
          <button
            className="faq-question"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            aria-controls={`faq-answer-${i}`}
          >
            <span>{item.q}</span>
            <span className="faq-icon" aria-hidden="true">
              {open === i ? '−' : '+'}
            </span>
          </button>
          <div
            id={`faq-answer-${i}`}
            className="faq-answer"
            hidden={open !== i}
          >
            <p>{item.a}</p>
          </div>
        </div>
      ))}

      <style jsx>{`
        .faq-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .faq-item {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .faq-item.open {
          border-color: var(--blue);
          box-shadow: 0 0 0 3px var(--blue-light);
        }
        .faq-question {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px;
          font-family: var(--font-body);
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
          text-align: left;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.2s;
        }
        .faq-item.open .faq-question {
          color: var(--blue);
        }
        .faq-icon {
          font-size: 22px;
          font-weight: 400;
          flex-shrink: 0;
          color: var(--blue);
          line-height: 1;
        }
        .faq-answer {
          padding: 0 24px 20px;
        }
        .faq-answer p {
          font-size: 15px;
          color: var(--text-secondary);
          line-height: 1.7;
        }
      `}</style>
    </div>
  )
}
