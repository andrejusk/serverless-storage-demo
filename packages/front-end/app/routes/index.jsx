import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Box,
  Container,
  Heading,
  HStack,
  Image,
  Input,
  Text,
} from "@chakra-ui/react";
import { json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";

import { Storage } from "@google-cloud/storage";

const bucket = storage.bucket(process.env.OUTPUT_BUCKET);

export async function action({ request }) {
  const upload = JSON.parse((await request.formData())._fields.upload);
  if (!upload) json({ message: "Missing upload" }, 400);
  console.log({ upload });
  // TODO generate upload URLs
  json({ upload }, 200);
  return null;
}

export default function Index() {
  const actionData = useActionData();
  console.log({ actionData });

  // Maintain file state, calculate when input is changed
  const [uploadState, setUpload] = useState([]);
  const isSubmittable = uploadState.length > 0;

  // TODO useEffect if returned action data needs to be uploaded

  const handleFileInput = async (e) => {
    const { files } = e.target;
    const newFileState = [];
    for (const file of files) {
      const digest = "N/A";
      const { lastModified, name, size, type } = file;
      newFileState.push({ lastModified, name, size, type, digest });
    }
    return setUpload(newFileState);
  };

  return (
    <Container my={21}>
      {/* Demo information */}
      <Heading>Serverless Storage Demo</Heading>
      <Text>Upload files, run checks and convert to PDF</Text>

      {/* New upload picker */}
      <Box as={Form} method="post" p={5} border={"1px"} my={7}>
        {/* Allow mutliple files to be selected */}
        <Text>Drag & drop file(s) here, or tap to select</Text>
        <Input
          type="file"
          id="file-input"
          onChange={handleFileInput}
          multiple
          p={1}
          my={3}
        />

        {/* If selected, display upload summary */}
        {isSubmittable ? (
          <Heading size="md" mt={3}>
            You are uploading
          </Heading>
        ) : null}
        {uploadState.map((file) => (
          <Box my={1} key={file.name}>
            <Text>
              {file.name} ({file.type}) &ndash; {file.size} bytes
            </Text>
            <Text>MD5: {file.digest}</Text>
          </Box>
        ))}

        {/* Submit upload(s) */}
        <Input
          hidden
          readOnly
          name="upload"
          value={JSON.stringify(uploadState)}
        />
        <Button type="submit" disabled={!isSubmittable} mt={2}>
          Submit
        </Button>
      </Box>

      {/* Existing uploads (if any) */}
      <Box p={5} border={"1px"} my={3}>
        <HStack>
          <Badge variant="outline" colorScheme="green">
            Uploaded
          </Badge>
          <Badge variant="solid" colorScheme="green">
            PDF Available
          </Badge>
        </HStack>
        <Text>Sample file 1</Text>
      </Box>
      <Box p={5} border={"1px"} my={3}>
        <HStack>
          <Badge variant="outline" colorScheme="red">
            Deleted
          </Badge>
          <Badge variant="solid" colorScheme="red">
            Virus detected
          </Badge>
        </HStack>
        <Text>Sample file 2</Text>
      </Box>
      <Box p={5} border={"1px"} my={3}>
        <HStack>
          <Badge variant="outline" colorScheme="green">
            Uploaded
          </Badge>
          <Badge colorScheme="yellow">PDF Generation Failed</Badge>
        </HStack>
        <Text>Sample file 3</Text>
      </Box>

      {/* Copyright */}
      <Box as="footer" mt={42}>
        <Text muted>&copy; {new Date().getFullYear()}</Text>
      </Box>
    </Container>
  );
}
