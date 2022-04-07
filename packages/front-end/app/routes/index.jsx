import React from "react";
import {
  Badge,
  Box,
  Container,
  Heading,
  HStack,
  Input,
  Text,
} from "@chakra-ui/react";
import { useFetcher } from "@remix-run/react";
import { useDropzone } from "react-dropzone";

// Copyright
const Footer = (props) => (
  <Box as="footer" mt={42} {...props}>
    <Text muted>&copy; andrejusk {new Date().getFullYear()}</Text>
  </Box>
);

export function ErrorBoundary({ error }) {
  return (
    <Container my={21}>
      <Heading>Caught unhandled error</Heading>
      <Text>{error.message}</Text>
      <Heading size="sm">Stack trace is:</Heading>
      <pre>{error.stack}</pre>
      <Footer />
    </Container>
  );
}

const Upload = (props) => {
  const { file, dispatch } = props;
  const uploader = useFetcher();
  React.useEffect(() => {
    if (file.status === "init" && uploader.type === "init") {
      dispatch({ ...file, status: "submitting" });
      uploader.load(`/upload?${new URLSearchParams(file).toString()}`);
    }
    console.log({ data: uploader.data });
  }, [file, uploader, dispatch]);
  return (
    <Box border={"1px"}>
      <HStack>
        {file.status === "init" && (
          <Badge variant="outline">Initialising</Badge>
        )}
        {file.status === "submitting" && <Badge>Submitting</Badge>}
        {/* <Badge variant="outline" colorScheme="green">
          Uploaded
        </Badge>
        <Badge variant="solid" colorScheme="green">
          PDF Available
        </Badge> */}
      </HStack>
      <Text>{file.name}</Text>
    </Box>
  );
};

/**
 * Application index page
 *
 * Present upload interface to the user,
 * handle file ingest and display ingest status.
 */
export default function Index() {
  // Add files to state using drop zone
  const [state, dispatch] = React.useReducer((acc, e) => {
    // Remove file if already exists
    acc = acc.filter((file) => file.name !== e.name);
    acc.push(e);
    return acc;
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) =>
      files.forEach(({ name, size, lastModified, type }) => {
        dispatch({ status: "init", name, size, lastModified, type });
      }),
  });

  return (
    <Container my={21}>
      {/* Demo information */}
      <Heading>Serverless Storage Demo</Heading>
      <Text>Upload files, run checks and convert to PDF</Text>

      {/* New upload picker */}
      <Box
        p={5}
        py={"3rem"}
        borderStyle="dashed"
        borderWidth={"1px"}
        my={7}
        {...getRootProps()}
      >
        {/* Allow mutliple files to be selected */}
        {isDragActive ? (
          <Text>Release to upload files!</Text>
        ) : (
          <Text>Drag & drop file(s) here, or tap to select...</Text>
        )}
        <Input
          type="file"
          id="file-input"
          multiple
          p={1}
          my={3}
          {...getInputProps()}
        />
      </Box>

      {/* Existing uploads (if any) */}
      {state.map((f) => (
        <Upload key={f.name} file={f} dispatch={dispatch} />
      ))}

      <Footer />
    </Container>
  );
}
