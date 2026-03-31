import { GraphQLScalarType } from "graphql";
import { Kind } from "graphql/language";

// Custom Date scalar
const DateType = new GraphQLScalarType({
  name: "Date",
  serialize: (value: any) => new Date(value).toISOString(),
  parseValue: (value: any) => new Date(value),
  parseLiteral: (ast: any) => {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// Custom BigInt scalar
const BigIntType = new GraphQLScalarType({
  name: "BigInt",
  description: "BigInt custom scalar type for large integers",
  serialize: (value: any) => {
    // Convert BigInt to string for JSON serialization
    if (typeof value === "bigint") {
      return value.toString();
    }
    // If it's already a number or string, return as is
    return value?.toString() || value;
  },
  parseValue: (value: any) => {
    // Parse incoming values from variables
    if (typeof value === "string" || typeof value === "number") {
      return BigInt(value);
    }
    if (typeof value === "bigint") {
      return value;
    }
    throw new Error("BigInt cannot represent non-integer value: " + value);
  },
  parseLiteral: (ast: any) => {
    // Parse literal values from queries
    if (ast.kind === Kind.INT || ast.kind === Kind.STRING) {
      return BigInt(ast.value);
    }
    throw new Error("BigInt cannot represent non-integer value: " + ast.value);
  },
});

const coreResolvers = {
  Date: DateType,
  BigInt: BigIntType,
};

export default coreResolvers;
