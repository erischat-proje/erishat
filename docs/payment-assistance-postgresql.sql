-- Reference only. The application creates these tables automatically on startup.

-- Existing users and lidya_manual_operations tables are required.


CREATE TABLE payment_assistance_requests (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(64) NOT NULL, 
	public_id VARCHAR(32) NOT NULL, 
	nickname VARCHAR(32) NOT NULL, 
	request_key VARCHAR(64) NOT NULL, 
	package_id INTEGER NOT NULL, 
	price_try INTEGER NOT NULL, 
	base INTEGER NOT NULL, 
	bonus INTEGER NOT NULL, 
	total INTEGER NOT NULL, 
	status VARCHAR(24) NOT NULL, 
	assigned_to VARCHAR(64), 
	agent_public_id VARCHAR(32), 
	customer_ack BOOLEAN NOT NULL, 
	agent_ack BOOLEAN NOT NULL, 
	customer_read INTEGER NOT NULL, 
	agent_read INTEGER NOT NULL, 
	accepted_at TIMESTAMP WITH TIME ZONE, 
	credit_operation_id VARCHAR(36), 
	transaction_reference VARCHAR(100), 
	receipt_sha VARCHAR(64), 
	reason VARCHAR(300) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	closed_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_payment_assistance_request UNIQUE (user_id, request_key), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(assigned_to) REFERENCES users (id), 
	UNIQUE (credit_operation_id), 
	FOREIGN KEY(credit_operation_id) REFERENCES lidya_manual_operations (id), 
	UNIQUE (transaction_reference), 
	UNIQUE (receipt_sha)
)

;

CREATE INDEX ix_payment_assistance_requests_assigned_to ON payment_assistance_requests (assigned_to);

CREATE INDEX ix_payment_assistance_requests_created_at ON payment_assistance_requests (created_at);

CREATE INDEX ix_payment_assistance_requests_status ON payment_assistance_requests (status);

CREATE INDEX ix_payment_assistance_requests_user_id ON payment_assistance_requests (user_id);

CREATE UNIQUE INDEX uq_payment_assistance_busy_da ON payment_assistance_requests (assigned_to) WHERE assigned_to IS NOT NULL AND status IN ('connecting','chat','rejecting','finishing');

CREATE UNIQUE INDEX uq_payment_assistance_live_customer ON payment_assistance_requests (user_id) WHERE status IN ('pending','connecting','chat','rejecting','finishing');


CREATE TABLE payment_assistance_messages (
	id SERIAL NOT NULL, 
	request_id VARCHAR(36) NOT NULL, 
	sender_id VARCHAR(64) NOT NULL, 
	sender_public_id VARCHAR(32) NOT NULL, 
	sender_side VARCHAR(8) NOT NULL, 
	request_key VARCHAR(64) NOT NULL, 
	message VARCHAR(2000) NOT NULL, 
	photo BYTEA, 
	photo_sha VARCHAR(64), 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_payment_assistance_message UNIQUE (request_id, sender_id, request_key), 
	FOREIGN KEY(request_id) REFERENCES payment_assistance_requests (id), 
	FOREIGN KEY(sender_id) REFERENCES users (id)
)

;

CREATE INDEX ix_payment_assistance_messages_request_id ON payment_assistance_messages (request_id);


CREATE TABLE payment_assistance_events (
	id SERIAL NOT NULL, 
	request_id VARCHAR(36) NOT NULL, 
	actor_id VARCHAR(64) NOT NULL, 
	actor_public_id VARCHAR(32) NOT NULL, 
	action VARCHAR(40) NOT NULL, 
	details TEXT NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(request_id) REFERENCES payment_assistance_requests (id), 
	FOREIGN KEY(actor_id) REFERENCES users (id)
)

;

CREATE INDEX ix_payment_assistance_events_request_id ON payment_assistance_events (request_id);


CREATE TABLE payment_assistance_presence (
	user_id VARCHAR(64) NOT NULL, 
	seen_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)

;

CREATE INDEX ix_payment_assistance_presence_seen_at ON payment_assistance_presence (seen_at);