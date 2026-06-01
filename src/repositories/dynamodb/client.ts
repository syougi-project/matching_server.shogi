export type DynamoCommandInput = {
  TableName: string;
  [key: string]: unknown;
};

export type DynamoCommand = {
  kind: 'GetCommand' | 'PutCommand' | 'UpdateCommand' | 'QueryCommand' | 'DeleteCommand';
  input: DynamoCommandInput;
};

export type DynamoResponse<T = Record<string, unknown>> = T;

export interface DynamoDocumentClientLike {
  send<T = Record<string, unknown>>(command: DynamoCommand): Promise<DynamoResponse<T>>;
}

export function getCommand(input: DynamoCommandInput): DynamoCommand {
  return { kind: 'GetCommand', input };
}

export function putCommand(input: DynamoCommandInput): DynamoCommand {
  return { kind: 'PutCommand', input };
}

export function updateCommand(input: DynamoCommandInput): DynamoCommand {
  return { kind: 'UpdateCommand', input };
}

export function queryCommand(input: DynamoCommandInput): DynamoCommand {
  return { kind: 'QueryCommand', input };
}

export function deleteCommand(input: DynamoCommandInput): DynamoCommand {
  return { kind: 'DeleteCommand', input };
}

export function isConditionalCheckFailed(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'ConditionalCheckFailedException' ||
      error.message.includes('ConditionalCheckFailed'))
  );
}
