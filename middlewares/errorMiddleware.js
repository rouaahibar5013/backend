class ErrorHandler extends Error {

    constructor(message,statusCode){
        super(message);
        this.statusCode=statusCode;
    }
}
export const errorMiddleware = (err,req,res,next)=>
{
    err.message= err.message || "internal server error";
    err.statusCode = err.statusCode || 500;

if(err.code === 11000)
{
    const message = " duplicate field value entred "
    err =  new ErrorHandler(message,400);

}
if(err.name === " JsonWebTokenError")
{
    const message = "Json  web token has expired , try again";
    err = new ErrorHandler(message,400);
}
  const errorMessage = err.errors
  ? Object.values(err.errors)
  .map((error)=> error.message)
  .join(",")
  : err.message;

  return res.status(err.statusCode).json({
success:false,
message: errorMessage,
  });

};
export default ErrorHandler;