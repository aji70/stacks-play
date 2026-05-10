;; STX Distributor Contract
;; Distributes STX across multiple wallets efficiently
;; Owner can fund the contract and distribute to recipients

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_INSUFFICIENT_BALANCE (err u402))
(define-constant ERR_TRANSFER_FAILED (err u403))
(define-constant ERR_INVALID_INPUT (err u404))

;; Data maps
(define-map distributions principal uint)
(define-map distribution-log {index: uint} {recipient: principal, amount: uint, block: uint})
(define-data-var distribution-count uint u0)
(define-data-var total-distributed uint u0)

;; Check if caller is owner
(define-private (is-owner)
  (is-eq tx-sender CONTRACT_OWNER)
)

;; Distribute equal amount to multiple recipients (list up to 50)
;; Usage: (distribute-equal recipients amount-per-recipient)
(define-public (distribute-equal (recipients (list 50 principal)) (amount-per-recipient uint))
  (begin
    ;; Verify owner
    (asserts! (is-owner) ERR_UNAUTHORIZED)

    ;; Verify amount is not zero
    (asserts! (> amount-per-recipient u0) ERR_INVALID_INPUT)

    ;; Process each recipient
    (ok (fold distribute-single recipients {count: u0, success: true}))
  )
)

;; Internal helper to distribute to single recipient
(define-private (distribute-single (recipient principal) (state {count: uint, success: bool}))
  (if (and (get success state) (< (get count state) u50))
    (let ((amount u10000000)) ;; 10 STX per wallet
      (match (stx-transfer? amount tx-sender recipient)
        ok-val
          (begin
            ;; Log the distribution
            (map-set distribution-log {index: (get count state)}
              {recipient: recipient, amount: amount, block: block-height})
            (var-set total-distributed (+ (var-get total-distributed) amount))
            (var-set distribution-count (+ (var-get distribution-count) u1))
            (map-set distributions recipient (+ (default-map distributions recipient u0) amount))
            {count: (+ (get count state) u1), success: true}
          )
        err-val
          {count: (get count state), success: false}
      )
    )
    state
  )
)

;; Distribute custom amounts to recipients
;; Requires lists to be same length
(define-public (distribute-custom
  (recipients (list 50 principal))
  (amounts (list 50 uint)))
  (begin
    ;; Verify owner
    (asserts! (is-owner) ERR_UNAUTHORIZED)

    ;; Process each recipient-amount pair
    (ok (fold distribute-with-amount
      (zip-lists recipients amounts)
      {count: u0, total-sent: u0}))
  )
)

;; Internal helper for custom distribution
(define-private (distribute-with-amount
  (pair {recipient: principal, amount: uint})
  (state {count: uint, total-sent: uint}))
  (let ((recipient (get recipient pair))
        (amount (get amount pair)))
    (match (stx-transfer? amount tx-sender recipient)
      ok-val
        (begin
          (map-set distribution-log {index: (get count state)}
            {recipient: recipient, amount: amount, block: block-height})
          (var-set total-distributed (+ (var-get total-distributed) amount))
          (var-set distribution-count (+ (var-get distribution-count) u1))
          (map-set distributions recipient (+ (default-map distributions recipient u0) amount))
          {count: (+ (get count state) u1), total-sent: (+ (get total-sent state) amount)}
        )
      err-val
        state
    )
  )
)

;; Simple batch transfer - send same amount to all recipients
(define-public (batch-send
  (recipients (list 50 principal))
  (amount-per uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (asserts! (> amount-per u0) ERR_INVALID_INPUT)

    (fold batch-send-helper recipients
      {count: u0, failed: u0})
    (ok true)
  )
)

(define-private (batch-send-helper (recipient principal) (state {count: uint, failed: uint}))
  (let ((amount u10000000)) ;; 10 STX per recipient
    (match (stx-transfer? amount tx-sender recipient)
      ok-val
        (begin
          (map-set distributions recipient (+ (default-map distributions recipient u0) amount))
          {count: (+ (get count state) u1), failed: (get failed state)}
        )
      err-val
        {count: (+ (get count state) u1), failed: (+ (get failed state) u1)}
    )
  )
)

;; Withdraw remaining balance (owner only)
(define-public (withdraw (amount uint))
  (begin
    (asserts! (is-owner) ERR_UNAUTHORIZED)
    (stx-transfer? amount (as-contract tx-sender) tx-sender)
  )
)

;; Query functions
(define-read-only (get-distribution-count)
  (var-get distribution-count)
)

(define-read-only (get-total-distributed)
  (var-get total-distributed)
)

(define-read-only (get-recipient-amount (recipient principal))
  (default-map distributions recipient u0)
)

(define-read-only (get-distribution-by-index (index uint))
  (map-get? distribution-log {index: index})
)

;; Helper to zip two lists together
(define-private (zip-lists
  (recipients (list 50 principal))
  (amounts (list 50 uint)))
  (map zip-pair recipients amounts)
)

(define-private (zip-pair (r principal) (a uint))
  {recipient: r, amount: a}
)
