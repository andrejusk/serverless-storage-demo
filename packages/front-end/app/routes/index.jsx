import { useEffect, useState, useRef } from "react";
import {
  Badge,
  Button,
  Box,
  Container,
  Heading,
  HStack,
  // Image,
  Input,
  Text,
} from "@chakra-ui/react";
import { useFetcher } from "@remix-run/react";

/**
 * Application index page
 *
 * Present file upload interface to the user,
 * handle file ingest and display ingest status.
 */
export default function Index() {
  const fetcher = useFetcher();
  const fileRef = useRef();

  // Maintain file state, calculate when input is changed
  const [uploadState, setUpload] = useState([]);
  const isSubmittable = uploadState.length > 0;
  const allowSubmit = fetcher.state === "idle" && isSubmittable;

  // Sync file picker with internal state
  const handleFileInput = async (e) => {
    if (!allowSubmit) throw "Not in a submitable state";
    const { files } = e.target;
    const newFileState = [];
    for (const file of files) {
      const digest = "N/A";
      const { lastModified, name, size, type } = file;
      newFileState.push({ lastModified, name, size, type, digest });
    }
    return setUpload(newFileState);
  };

  useEffect(() => {
    // Clear file picker if out of sync
    if (!isSubmittable) {
      fileRef.current.value = null;
    }
    // TODO useEffect if returned action data needs to be uploaded
  }, [isSubmittable]);

  const handleSubmit = (e) => {
    // FIXME is it submitting correctly?
    fetcher.submit(e.target);
  };
  // FIXME never goes out of 'idle'
  console.log({ fetcher });

  return (
    <Container my={21}>
      {/* Demo information */}
      {/* <Image src="/path/to/demo/logo"/> */}
      <Heading>Serverless Storage Demo</Heading>
      <Text>Upload files, run checks and convert to PDF</Text>

      {/* New upload picker */}
      <Box
        as={fetcher.Form}
        method="post"
        action="/upload"
        p={5}
        border={"1px"}
        my={7}
      >
        {/* Allow mutliple files to be selected */}
        <Text>Drag & drop file(s) here, or tap to select</Text>
        <Input
          ref={fileRef}
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
        <Button
          type="submit"
          disabled={!allowSubmit}
          mt={2}
          onSubmit={handleSubmit}
        >
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
